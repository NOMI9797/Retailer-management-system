"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, parseLocalDateEnd } from "@/lib/utils";
import { setOpeningBalanceSchema, closeDaySchema, type SetOpeningBalanceInput, type CloseDayInput } from "./schema";

// Calendar-day bounds in server local time — same convention
// findTodaysSale (daily-sales/actions.ts) and listExpenses use, so a
// day here means the same thing everywhere else in the app.
function dayBounds(dateStr: string) {
  return { start: parseLocalDateStart(dateStr), end: parseLocalDateEnd(dateStr) };
}

// Recovers calendar-day bounds directly from a Date already known to
// be local midnight for that day (i.e. a DailyCashRegister.date
// value) — NOT via toISOString().slice(0, 10), which reads the date
// back in UTC and silently returns the WRONG calendar day in any
// timezone ahead of UTC (e.g. local midnight 2026-05-01 in Pakistan is
// 2026-04-30T19:00:00Z, so toISOString() reports "2026-04-30").
function dayBoundsFromLocalMidnight(localMidnight: Date) {
  const start = new Date(localMidnight);
  start.setHours(0, 0, 0, 0);
  const end = new Date(localMidnight);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Cash in for a day = sum of DailySalePayment rows tagged CASH for
// sales made that day. Only Cash counts — Account and Credit amounts
// are not physical cash, regardless of how the milestone doc's
// original draft described AccountTransaction feeding into this: that
// assumption predates the Cash/Account/Credit redesign (see actions.ts
// history), and no AccountTransaction currently represents a
// same-day physical cash movement — consignment/farmer payouts are
// pure ledger accruals until an actual settlement flow exists, which
// is out of scope this milestone (confirmed decision, not an
// oversight). So this aggregation is deliberately narrower than the
// milestone doc's original description.
async function sumCashIn(shopId: string, start: Date, end: Date) {
  const result = await db.dailySalePayment.aggregate({
    where: {
      paymentMethod: "CASH",
      dailySale: { shopId, saleDate: { gte: start, lte: end } },
    },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

// Cash out for a day = sum of Expense rows tagged CASH for that day.
async function sumCashOut(shopId: string, start: Date, end: Date) {
  const result = await db.expense.aggregate({
    where: { shopId, expenseType: "DAILY", paymentMethod: "CASH", expenseDate: { gte: start, lte: end } },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

// Same shape as sumCashIn/sumCashOut, generalized to any PaymentMethod
// — used for the Account and Credit info cards, which are purely
// informational (see getCashFlowForDate) and never feed into
// opening/expected/actual/variance, since neither is physical cash in
// the drawer.
async function sumSalePayments(shopId: string, method: "ACCOUNT" | "CREDIT", start: Date, end: Date) {
  const result = await db.dailySalePayment.aggregate({
    where: { paymentMethod: method, dailySale: { shopId, saleDate: { gte: start, lte: end } } },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

async function sumExpensesByMethod(shopId: string, method: "ACCOUNT" | "CREDIT", start: Date, end: Date) {
  const result = await db.expense.aggregate({
    where: { shopId, expenseType: "DAILY", paymentMethod: method, expenseDate: { gte: start, lte: end } },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

// Finds the opening balance for `date`: the prior day's actualClosing
// if a register entry exists for any earlier date (skipping over gaps
// from days the shop was closed — the most recent recorded closing
// carries forward, per the "skipped day" decision), or null if none
// exists yet (meaning this shop has never set an opening balance and
// needs the one-time manual entry).
async function resolveOpeningBalance(shopId: string, date: Date) {
  const priorClose = await db.dailyCashRegister.findFirst({
    where: { shopId, date: { lt: date }, actualClosing: { not: null } },
    orderBy: { date: "desc" },
  });
  return priorClose ? Number(priorClose.actualClosing) : null;
}

// After a day's actualClosing changes (via closeDay or
// editClosingBalance), every LATER day whose opening balance was
// DERIVED from a prior closing (openingBalanceIsManual: false) is now
// stale — its opening, expectedClosing, and variance all implicitly
// depend on the day that just changed. This walks forward
// chronologically from the edited day, recomputing each such day in
// turn, and stops the moment it reaches a day whose opening balance
// was manually overridden — a manual entry always wins over whatever
// an earlier day's closing implies, so it acts as a firewall past
// which nothing here needs to change. Per the "cascade until a manual
// override stops it" decision.
async function cascadeForward(shopId: string, fromDate: Date) {
  let priorClosing: number | null = null;
  const priorRow = await db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: fromDate } } });
  if (priorRow?.actualClosing != null) priorClosing = Number(priorRow.actualClosing);

  // Walk every later register row in date order — only rows that
  // exist need touching; a day with no row yet has nothing stored to
  // go stale, and will simply resolve correctly on its own next visit.
  const laterRows = await db.dailyCashRegister.findMany({
    where: { shopId, date: { gt: fromDate } },
    orderBy: { date: "asc" },
  });

  for (const row of laterRows) {
    if (row.openingBalanceIsManual) {
      // Firewall reached — this and every day after it keep whatever
      // they already have; if THIS day's closing also changes below,
      // the loop's own next iteration picks that up naturally.
      if (row.actualClosing != null) {
        priorClosing = Number(row.actualClosing);
        continue;
      }
      break;
    }

    if (priorClosing === null) {
      // No prior closing to derive from (shouldn't normally happen
      // once a chain has started, but bail out safely rather than
      // guessing at zero).
      break;
    }

    const { start, end } = dayBoundsFromLocalMidnight(row.date);
    const cashIn = await sumCashIn(shopId, start, end);
    const cashOut = await sumCashOut(shopId, start, end);
    const expectedClosing = priorClosing + cashIn - cashOut;

    await db.dailyCashRegister.update({
      where: { id: row.id },
      data: { openingBalance: priorClosing, expectedClosing },
    });

    priorClosing = row.actualClosing != null ? Number(row.actualClosing) : null;
    if (priorClosing === null) break; // nothing closed yet past this point — stop, there's nothing further to derive
  }
}

// The Cash Flow page's data source for one day: opening balance, cash
// in/out for that day, expected closing, and (if the day has already
// been closed) the actual closing and variance — plus Account in/out
// and Credit totals for the same day, purely informational. Only the
// cash figures ever feed opening/expected/actual/variance; Account
// and Credit are shown so the full picture is visible on this page,
// per the "extra info cards, not part of the cash math" decision —
// neither is physical money in the drawer, so neither belongs in the
// register reconciliation itself. needsOpeningBalance is true only
// when there is truly no prior register entry anywhere for this shop
// — the one-time setup case.
export async function getCashFlowForDate(dateStr: string) {
  const shopId = await getCurrentShopId();
  const { start, end } = dayBounds(dateStr);

  const [existing, cashIn, cashOut, resolvedOpening, accountIn, accountOut, creditIn, creditOut, salesCount, expenseCount] =
    await Promise.all([
      db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } }),
      sumCashIn(shopId, start, end),
      sumCashOut(shopId, start, end),
      resolveOpeningBalance(shopId, start),
      sumSalePayments(shopId, "ACCOUNT", start, end),
      sumExpensesByMethod(shopId, "ACCOUNT", start, end),
      sumSalePayments(shopId, "CREDIT", start, end),
      sumExpensesByMethod(shopId, "CREDIT", start, end),
      // Sale/expense counts — a genuinely new "how busy was this day"
      // metric, distinct from any of the money totals above. This is
      // the natural place to grow the day dashboard with more metrics
      // over time (e.g. average sale size, top product) without
      // touching the register math itself.
      db.dailySale.count({ where: { shopId, saleDate: { gte: start, lte: end } } }),
      db.expense.count({ where: { shopId, expenseType: "DAILY", expenseDate: { gte: start, lte: end } } }),
    ]);

  const openingBalance = existing ? Number(existing.openingBalance) : resolvedOpening;
  const needsOpeningBalance = openingBalance === null;
  const expectedClosing = (openingBalance ?? 0) + cashIn - cashOut;
  const actualClosing = existing?.actualClosing != null ? Number(existing.actualClosing) : null;

  return {
    date: dateStr,
    openingBalance: openingBalance ?? 0,
    needsOpeningBalance,
    cashIn,
    cashOut,
    expectedClosing,
    actualClosing,
    variance: actualClosing !== null ? actualClosing - expectedClosing : null,
    isClosed: existing?.closedAt != null,
    accountIn,
    accountOut,
    creditIn,
    creditOut,
    salesCount,
    expenseCount,
  };
}

// The one-time manual seed for a shop that has never used Cash Flow
// before — every later day's opening is derived automatically from
// the prior day's actualClosing instead (see resolveOpeningBalance).
// Rejects if a register entry already exists for this date, since
// that means an opening balance (derived or manual) already governs
// it — use closeDay to record the day's actual count instead.
export async function setOpeningBalance(input: SetOpeningBalanceInput) {
  const shopId = await getCurrentShopId();
  const data = setOpeningBalanceSchema.parse(input);
  const { start, end } = dayBounds(data.date);

  const existing = await db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } });
  if (existing) throw new Error("This day already has a register entry");

  const cashIn = await sumCashIn(shopId, start, end);
  const cashOut = await sumCashOut(shopId, start, end);

  await db.dailyCashRegister.create({
    data: {
      shopId,
      date: start,
      openingBalance: data.openingBalance,
      expectedClosing: data.openingBalance + cashIn - cashOut,
      openingBalanceIsManual: true,
    },
  });
}

// Overrides a day's opening balance — whether it was previously
// derived from the prior day's actualClosing or manually set — with a
// value that sticks permanently for that day (same "manual entry
// wins" precedent as actualClosing). Recomputes expectedClosing (and
// therefore variance, computed at read time) immediately so the two
// numbers never drift out of sync, whether or not the day has already
// been closed — per the "allow on any day" decision, editing the
// opening balance of an already-closed day is a legitimate correction,
// not something that should be locked out.
export async function editOpeningBalance(input: SetOpeningBalanceInput) {
  const shopId = await getCurrentShopId();
  const data = setOpeningBalanceSchema.parse(input);
  const { start, end } = dayBounds(data.date);

  const existing = await db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } });

  const cashIn = await sumCashIn(shopId, start, end);
  const cashOut = await sumCashOut(shopId, start, end);
  const expectedClosing = data.openingBalance + cashIn - cashOut;

  await db.dailyCashRegister.upsert({
    where: { shopId_date: { shopId, date: start } },
    create: {
      shopId,
      date: start,
      openingBalance: data.openingBalance,
      expectedClosing,
      openingBalanceIsManual: true,
    },
    update: {
      openingBalance: data.openingBalance,
      expectedClosing,
      openingBalanceIsManual: true,
      // actualClosing/closedAt are left untouched — editing the
      // opening balance recalculates what was EXPECTED, not what was
      // actually counted, so a previously-recorded count stays as
      // history; only the variance against it shifts accordingly.
    },
  });

  // This day now has a MANUAL opening balance, which is a firewall for
  // the forward cascade — but this day's own expectedClosing/actual
  // just changed, so anything derived from THIS day's closing (if it
  // has one) still needs to be walked forward from here.
  await cascadeForward(shopId, start);

  return { openingBalance: data.openingBalance, expectedClosing };
}

// Day close: records what the shopkeeper actually counted.
// expectedClosing is recomputed and stored as a snapshot at this exact
// moment — see DailyCashRegister's schema comment for why closing
// freezes it rather than leaving it always-live. Works whether or not
// a register row already exists for the day (a day with a derived-only
// opening balance won't have one yet).
export async function closeDay(input: CloseDayInput) {
  const shopId = await getCurrentShopId();
  const data = closeDaySchema.parse(input);
  const { start, end } = dayBounds(data.date);

  // The day being closed might already have its own register row (a
  // manually-seeded opening balance with no actualClosing yet) — that
  // takes priority over the prior day's closing. Only fall back to
  // resolveOpeningBalance (the prior day's actualClosing) when this
  // day has no row of its own at all.
  const ownRow = await db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } });
  const openingBalance = ownRow ? Number(ownRow.openingBalance) : await resolveOpeningBalance(shopId, start);
  if (openingBalance === null) {
    throw new Error("Set an opening balance for this shop before closing a day");
  }

  const cashIn = await sumCashIn(shopId, start, end);
  const cashOut = await sumCashOut(shopId, start, end);
  const expectedClosing = openingBalance + cashIn - cashOut;

  await db.dailyCashRegister.upsert({
    where: { shopId_date: { shopId, date: start } },
    create: {
      shopId,
      date: start,
      openingBalance,
      expectedClosing,
      actualClosing: data.actualClosing,
      closedAt: new Date(),
    },
    update: {
      expectedClosing,
      actualClosing: data.actualClosing,
      closedAt: new Date(),
    },
  });

  // This day's actualClosing is what later days derive their opening
  // balance from — walk forward and recompute anything downstream that
  // depended on it.
  await cascadeForward(shopId, start);
}

// Corrects a day's actual closing after the fact — e.g. a miscount
// noticed later. Unlike closeDay, this doesn't require the day to be
// open; it works on any day that already has a register row (one that
// doesn't yet has nothing to correct — use closeDay to close it the
// first time). Recomputes this day's own expectedClosing (its opening
// and today's cash in/out haven't changed, only what was counted) and
// then cascades forward exactly like closeDay does, since this day's
// closing is what later derived days depend on.
export async function editClosingBalance(input: CloseDayInput) {
  const shopId = await getCurrentShopId();
  const data = closeDaySchema.parse(input);
  const { start, end } = dayBounds(data.date);

  const existing = await db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } });
  if (!existing) {
    throw new Error("This day hasn't been closed yet — use Close day to record its first count.");
  }

  const cashIn = await sumCashIn(shopId, start, end);
  const cashOut = await sumCashOut(shopId, start, end);
  const expectedClosing = Number(existing.openingBalance) + cashIn - cashOut;

  await db.dailyCashRegister.update({
    where: { id: existing.id },
    data: { expectedClosing, actualClosing: data.actualClosing },
  });

  await cascadeForward(shopId, start);
}

// Historical register — past days' closes, filterable by date range.
// expectedClosing is recomputed live for every row (opening + that
// day's current cash in/out), never read from the stored snapshot —
// same "always live" rule getCashFlowForDate already followed for the
// single-day view. This is what makes a backdated sale entered after
// a day was closed show up correctly here too: the stored
// expectedClosing column still exists (cascadeForward keeps it
// reasonably in sync for chain-derivation purposes), but history never
// trusts it directly, so it can never go stale in what the shopkeeper
// actually sees. actualClosing is untouched either way — that's the
// one number that stays exactly what was manually counted.
export async function listCashRegisterHistory(options?: { fromDate?: string; toDate?: string }) {
  const shopId = await getCurrentShopId();

  // fromDate/toDate are plain "YYYY-MM-DD" strings, which parse to
  // UTC midnight — but the `date` column is stored at LOCAL midnight
  // (see dayBounds), which in a timezone ahead of UTC (like Pakistan's)
  // is an earlier UTC instant than that day's UTC midnight. Comparing
  // against raw UTC-midnight bounds would incorrectly exclude rows
  // right at the edges of the range, so both bounds are normalized
  // through dayBounds the same way every other date-range filter in
  // this module already is.
  const fromBound = options?.fromDate ? dayBounds(options.fromDate).start : undefined;
  const toBound = options?.toDate ? dayBounds(options.toDate).end : undefined;

  const entries = await db.dailyCashRegister.findMany({
    where: {
      shopId,
      date: {
        gte: fromBound,
        lte: toBound,
      },
    },
    orderBy: { date: "desc" },
  });

  return Promise.all(
    entries.map(async (e) => {
      const { start, end } = dayBoundsFromLocalMidnight(e.date);
      const cashIn = await sumCashIn(shopId, start, end);
      const cashOut = await sumCashOut(shopId, start, end);
      const openingBalance = Number(e.openingBalance);
      const expectedClosing = openingBalance + cashIn - cashOut;
      const actualClosing = e.actualClosing != null ? Number(e.actualClosing) : null;

      return {
        id: e.id,
        date: e.date,
        openingBalance,
        expectedClosing,
        actualClosing,
        variance: actualClosing !== null ? actualClosing - expectedClosing : null,
        closedAt: e.closedAt,
      };
    })
  );
}
