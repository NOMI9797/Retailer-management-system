"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import { reportPeriodSchema, type ReportPeriodInput } from "./schema";
import { getStockUdhaarSummary } from "@/modules/stock/actions";

export type PnlReport = {
  revenue: number;
  cogs: number;
  // true when at least one sale item in this period has no cost
  // snapshot (pre-Milestone-4 data) — the UI shows "cost data
  // unavailable" for the affected figures instead of a number that
  // silently understates COGS.
  hasUnknownCost: boolean;
  grossProfit: number;
  expenses: number;
  netProfit: number;
};

// Resolves a report period into a concrete [start, end] Date range, or
// null for "seasonal" which filters by DailySale.season instead of a
// date range.
function resolveDateRange(period: ReportPeriodInput): { start: Date; end: Date } | null {
  if (period.view === "daily") {
    return { start: parseLocalDateStart(period.date), end: parseLocalDateEnd(period.date) };
  }
  if (period.view === "monthly") {
    const start = new Date(period.year, period.month - 1, 1, 0, 0, 0, 0);
    const end = new Date(period.year, period.month, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (period.view === "yearly") {
    const start = new Date(period.year, 0, 1, 0, 0, 0, 0);
    const end = new Date(period.year, 11, 31, 23, 59, 59, 999);
    return { start, end };
  }
  return null;
}

// The one aggregation implementation every view (Daily/Monthly/Yearly/
// Seasonal) shares — only how the date/season filter is built differs,
// per the milestone doc's "same shape of numbers across all views."
export async function getPnlReport(input: ReportPeriodInput): Promise<PnlReport> {
  const shopId = await getCurrentShopId();
  const period = reportPeriodSchema.parse(input);
  const range = resolveDateRange(period);

  const saleDateFilter = range
    ? { saleDate: { gte: range.start, lte: range.end } }
    : { season: period.view === "seasonal" ? period.season : undefined };

  const items = await db.dailySaleItem.findMany({
    where: { dailySale: { shopId, ...saleDateFilter } },
    include: {
      product: { select: { stockKind: true } },
      batchAllocations: { include: { grainBatch: { select: { rate: true } } } },
    },
  });

  let revenue = 0;
  let cogs = 0;
  let hasUnknownCost = false;

  for (const item of items) {
    const quantity = Number(item.quantity);
    const actualPrice = Number(item.actualPrice);
    revenue += quantity * actualPrice;

    if (item.product.stockKind === "SIMPLE") {
      if (item.costPriceAtSale === null) {
        hasUnknownCost = true;
      } else {
        cogs += quantity * Number(item.costPriceAtSale);
      }
    } else {
      // Grain: no snapshot field needed — each batch allocation
      // records exactly which batch(es) a sale drew from, and that
      // batch's OWN rate is the historically accurate cost, updated
      // live rather than frozen at sale time. A customer's "store for
      // later" deposit can still be rate-less at the moment it's sold
      // from (selling doesn't force a price — the rate only gets
      // agreed later, when the shopkeeper settles with the depositor
      // via a transfer-purchase) — same "unknown, never silently
      // zeroed" treatment the SIMPLE branch above already gives a
      // missing costPriceAtSale. Once that batch is later priced,
      // this exact code path picks up the correct cost automatically
      // on the next report pull, with no separate reconciliation step
      // — nothing about this query is a snapshot.
      for (const alloc of item.batchAllocations) {
        if (alloc.grainBatch.rate === null) {
          hasUnknownCost = true;
        } else {
          cogs += Number(alloc.quantity) * Number(alloc.grainBatch.rate);
        }
      }
    }
  }

  const expenseDateFilter = range
    ? { expenseDate: { gte: range.start, lte: range.end } }
    : {};
  const expenseSeasonNote = period.view === "seasonal";
  // Expenses have no season field — a seasonal P&L can only ever
  // reflect revenue/COGS by season; expenses are date-based and don't
  // map onto a season, so they're left at 0 for that view rather than
  // guessing which expenses "belong" to a season.
  const expenseTotal = expenseSeasonNote
    ? 0
    : (
        await db.expense.aggregate({
          where: { shopId, ...expenseDateFilter },
          _sum: { amount: true },
        })
      )._sum.amount ?? 0;

  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - Number(expenseTotal);

  return {
    revenue,
    cogs,
    hasUnknownCost,
    grossProfit,
    expenses: Number(expenseTotal),
    netProfit,
  };
}

export type BalanceSummary = {
  customersOwe: number;
};

// Powers the Dashboard's "Customers owe" card. A positive
// currentBalance means the customer owes the shop (describeBalance's
// sign convention) — summed across every account. A negative balance
// (e.g. from a Stock Management transfer-purchase the shop hasn't
// finished paying out) means the shop owes the customer instead; that
// side isn't rolled into this money summary — it shows on the
// account itself, and Stock Udhaar (a quantity obligation, not money)
// gets its own report surface — see stock/actions.ts:
// getStockUdhaarSummary. Not cached — always queried fresh, per the
// milestone's "nothing cached" requirement.
export async function getBalanceSummary(): Promise<BalanceSummary> {
  const shopId = await getCurrentShopId();

  const accounts = await db.customerAccount.findMany({
    where: { customer: { shopId } },
    select: { currentBalance: true },
  });

  let customersOwe = 0;
  for (const account of accounts) {
    const balance = Number(account.currentBalance);
    if (balance > 0) customersOwe += balance;
  }

  return { customersOwe };
}

// Shop-wide outstanding Stock Udhaar, by customer+product — kept as
// its own report surface rather than folded into BalanceSummary,
// since it's a QUANTITY obligation (tons/kg of grain still owed to a
// customer), not money, and summing it into a money figure would be
// meaningless. Thin wrapper over stock/actions.ts's own summary so
// there's exactly one implementation of the shortfall math.
export async function getStockUdhaarReport() {
  return getStockUdhaarSummary();
}

export type DailyPnlHistoryEntry = {
  date: string; // "YYYY-MM-DD"
  revenue: number;
  cogs: number;
  hasUnknownCost: boolean;
  grossProfit: number;
  expenses: number;
  netProfit: number;
};

// Powers the Reports History table — a scannable ledger of past days'
// P&L, same shape as Register History's list of past cash-register
// days, with each row linking through to that day's full Daily report
// (/dashboard/reports?tab=daily&date=...). A "day" here is any day
// that had at least one sale OR at least one expense, so a day with
// only expenses (no sales) still shows up rather than being silently
// skipped. Each day's figures are computed via getPnlReport — the
// exact same aggregation the Daily tab itself uses — so this list and
// that detail view can never drift apart into two different answers
// for the same day.
export async function listDailyPnlHistory(options?: { fromDate?: string; toDate?: string }) {
  const shopId = await getCurrentShopId();

  const dateFilter = {
    gte: options?.fromDate ? parseLocalDateStart(options.fromDate) : undefined,
    lte: options?.toDate ? parseLocalDateEnd(options.toDate) : undefined,
  };

  const [saleDates, expenseDates] = await Promise.all([
    db.dailySale.findMany({
      where: { shopId, saleDate: dateFilter },
      select: { saleDate: true },
    }),
    db.expense.findMany({
      where: { shopId, expenseDate: dateFilter },
      select: { expenseDate: true },
    }),
  ]);

  const distinctDates = new Set<string>();
  for (const s of saleDates) distinctDates.add(toLocalDateString(s.saleDate));
  for (const e of expenseDates) distinctDates.add(toLocalDateString(e.expenseDate));

  const sortedDates = Array.from(distinctDates).sort((a, b) => (a < b ? 1 : -1));

  const entries: DailyPnlHistoryEntry[] = await Promise.all(
    sortedDates.map(async (date) => {
      const report = await getPnlReport({ view: "daily", date });
      return { date, ...report };
    })
  );

  return entries;
}

// Distinct, non-null season values recorded so far — powers the
// Seasonal view's season picker without hardcoding a list (per the
// product document's "no hardcoded lists" principle) and without any
// season-management UI, per this milestone's explicit scope decision.
export async function listAvailableSeasons(): Promise<string[]> {
  const shopId = await getCurrentShopId();
  const rows = await db.dailySale.findMany({
    where: { shopId, season: { not: null } },
    select: { season: true },
    distinct: ["season"],
  });
  return rows.map((r) => r.season!).filter(Boolean).sort();
}
