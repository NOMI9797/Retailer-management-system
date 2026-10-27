"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import { setOpeningBalanceSchema, closeDaySchema, type SetOpeningBalanceInput, type CloseDayInput } from "./schema";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { cashForRange, moneyForRange, summarizeMoney } from "./cashFlowMath";
import { listBankAccountTransactions } from "@/modules/settings/bankAccounts.actions";

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

// Physical cash into / out of the drawer for a day — worked out from
// the same records the Daily sales page lists (see cashFlowMath), so
// every cash entry the shop records counts here, whichever section it
// was recorded in. Bank (Account) and Udhaar never touch the drawer.
async function sumCashIn(shopId: string, start: Date, end: Date) {
  return (await cashForRange(shopId, start, end)).in;
}

async function sumCashOut(shopId: string, start: Date, end: Date) {
  return (await cashForRange(shopId, start, end)).out;
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

  await cascadeForwardFrom(shopId, fromDate, priorClosing);
}

// The actual walk-forward-and-recompute loop, factored out of
// cascadeForward so deleteCashRegisterEntry can reuse it with a
// DIFFERENT starting closing — cascadeForward always reads fromDate's
// OWN row for its baseline (the normal "this day's closing just
// changed" case), but a delete needs the closing from whatever day is
// now the latest one BEFORE fromDate instead, since fromDate's own
// row is gone by the time this runs (see
// resolveOpeningBalance, the same lookup getCashFlowForDate's
// needsOpeningBalance case already uses).
async function cascadeForwardFrom(shopId: string, fromDate: Date, startingClosing: number | null) {
  let priorClosing = startingClosing;

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

// One day's cash register: opening balance, cash in/out of the drawer,
// expected closing, and (once the day is closed) the actual count and
// the difference. needsOpeningBalance is true only when this shop has
// no register entry anywhere yet — the one-time setup. Also feeds the
// Dashboard's cash-in-hand figure.
export async function getCashFlowForDate(dateStr: string) {
  const shopId = await getCurrentShopId();
  const { start, end } = dayBounds(dateStr);

  const [existing, cash, resolvedOpening] = await Promise.all([
    db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } }),
    cashForRange(shopId, start, end),
    resolveOpeningBalance(shopId, start),
  ]);

  const openingBalance = existing ? Number(existing.openingBalance) : resolvedOpening;
  const needsOpeningBalance = openingBalance === null;
  const expectedClosing = (openingBalance ?? 0) + cash.in - cash.out;
  const actualClosing = existing?.actualClosing != null ? Number(existing.actualClosing) : null;

  return {
    date: dateStr,
    openingBalance: openingBalance ?? 0,
    needsOpeningBalance,
    cashIn: cash.in,
    cashOut: cash.out,
    expectedClosing,
    actualClosing,
    variance: actualClosing !== null ? actualClosing - expectedClosing : null,
    isClosed: existing?.closedAt != null,
  };
}

export type CashFlowPeriod = "day" | "week" | "month";

// The Cash flow page for a day, week (Mon–Sun) or month around `date`:
// money in, money out and net (cash + bank), where it moved (cash vs
// each bank account), Udhaar given/taken (no money moved), a breakdown
// by kind of entry, and — for a week or month — the same per day.
// Built from the Daily sales records, so the two pages always agree.
export async function getCashFlowOverview(dateStr: string, period: CashFlowPeriod) {
  const shopId = await getCurrentShopId();
  const anchor = parseLocalDateStart(dateStr);
  const from = new Date(anchor);
  const to = new Date(anchor);
  if (period === "week") {
    const offset = (anchor.getDay() + 6) % 7; // Monday = 0
    from.setDate(anchor.getDate() - offset);
    to.setDate(from.getDate() + 6);
  } else if (period === "month") {
    from.setDate(1);
    to.setMonth(anchor.getMonth() + 1, 0);
  }
  const fromStr = toLocalDateString(from);
  const toStr = toLocalDateString(to);
  const start = parseLocalDateStart(fromStr);
  const end = parseLocalDateEnd(toStr);

  const [{ rows, summary }, bank] = await Promise.all([
    moneyForRange(shopId, start, end),
    listBankAccountTransactions({ fromDate: fromStr, toDate: toStr, pageSize: 100000 }),
  ]);

  const byAccount = new Map<string, { name: string; in: number; out: number }>();
  for (const r of bank.rows) {
    // An imported opening balance isn't money that moved that day.
    if (r.isOpeningImport) continue;
    const acc = byAccount.get(r.bankAccountId) ?? { name: r.bankAccountName, in: 0, out: 0 };
    if (r.direction === "IN") acc.in += r.amount;
    else acc.out += r.amount;
    byAccount.set(r.bankAccountId, acc);
  }

  // Per day, for the week / month bars.
  const days: { date: string; in: number; out: number }[] = [];
  if (period !== "day") {
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = toLocalDateString(d);
      const daySummary = summarizeMoney(rows.filter((r) => toLocalDateString(r.date) === key));
      days.push({ date: key, in: daySummary.moneyIn, out: daySummary.moneyOut });
    }
  }

  return {
    period,
    fromDate: fromStr,
    toDate: toStr,
    ...summary,
    net: Math.round((summary.moneyIn - summary.moneyOut) * 100) / 100,
    bankAccounts: [...byAccount.values()].sort((a, b) => a.name.localeCompare(b.name)),
    days,
  };
}

// The one-time manual seed for a shop that has never used Cash Flow
// before — every later day's opening is derived automatically from
// the prior day's actualClosing instead (see resolveOpeningBalance).
// Rejects if a register entry already exists for this date, since
// that means an opening balance (derived or manual) already governs
// it — use closeDay to record the day's actual count instead.
export async function setOpeningBalance(input: SetOpeningBalanceInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const data = setOpeningBalanceSchema.parse(input);
  const { start, end } = dayBounds(data.date);

  const existing = await db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } });
  if (existing) return fail("This day already has a register entry");

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
  return ok(null);
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
export async function closeDay(input: CloseDayInput): Promise<ActionResult<null>> {
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
    return fail("Set an opening balance for this shop before closing a day");
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
  return ok(null);
}

// Corrects a day's actual closing after the fact — e.g. a miscount
// noticed later. Unlike closeDay, this doesn't require the day to be
// open; it works on any day that already has a register row (one that
// doesn't yet has nothing to correct — use closeDay to close it the
// first time). Recomputes this day's own expectedClosing (its opening
// and today's cash in/out haven't changed, only what was counted) and
// then cascades forward exactly like closeDay does, since this day's
// closing is what later derived days depend on.
export async function editClosingBalance(input: CloseDayInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const data = closeDaySchema.parse(input);
  const { start, end } = dayBounds(data.date);

  const existing = await db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } });
  if (!existing) {
    return fail("This day hasn't been closed yet — use Close day to record its first count.");
  }

  const cashIn = await sumCashIn(shopId, start, end);
  const cashOut = await sumCashOut(shopId, start, end);
  const expectedClosing = Number(existing.openingBalance) + cashIn - cashOut;

  await db.dailyCashRegister.update({
    where: { id: existing.id },
    data: { expectedClosing, actualClosing: data.actualClosing },
  });

  await cascadeForward(shopId, start);
  return ok(null);
}

// Deletes a day's register entry entirely — e.g. a day closed by
// mistake, or test/incorrect data entered while setting things up.
// Unlike editClosingBalance (which keeps the row and only changes its
// counted amount), this removes it outright, so every LATER day that
// derived its opening balance from this one needs to re-derive from
// whatever closing now exists before it instead — same cascade
// cascadeForward already runs after an edit, just anchored at a
// different starting point (see cascadeForwardFrom's comment): the
// most recent actual closing strictly BEFORE this day, since this
// day's own row won't exist anymore by the time the cascade runs.
export async function deleteCashRegisterEntry(date: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const { start } = dayBounds(date);

  const existing = await db.dailyCashRegister.findUnique({ where: { shopId_date: { shopId, date: start } } });
  if (!existing) return fail("No register entry exists for this day.");

  const newStartingClosing = await resolveOpeningBalance(shopId, start);

  await db.dailyCashRegister.delete({ where: { id: existing.id } });
  await cascadeForwardFrom(shopId, start, newStartingClosing);

  return ok(null);
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
