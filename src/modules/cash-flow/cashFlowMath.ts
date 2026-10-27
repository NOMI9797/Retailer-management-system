import { collectLedgerRows, type LedgerCategory, type LedgerRow } from "@/modules/ledger/ledgerRows";

// Cash flow's numbers, worked out from the SAME rows the Daily sales
// page lists (collectLedgerRows) — so every entry the shop records is
// counted here too, and the two pages always agree. Money means Cash +
// Bank (Account); Udhaar (Credit) moves no money, so it's totalled
// apart. Grain-only rows move nothing and are skipped. Not a "use
// server" module — it takes a shopId (see collectLedgerRows).

export type Flow = { in: number; out: number };

export type MoneySummary = {
  moneyIn: number;
  moneyOut: number;
  cash: Flow;
  bank: Flow;
  // Sold or lent on Udhaar today (owed TO the shop) / bought or spent on
  // Udhaar (owed BY the shop). Old balances imported from the register
  // aren't the day's activity and are left out.
  udhaar: { given: number; taken: number };
  byCategory: Record<LedgerCategory, Flow>;
  entriesIn: number;
  entriesOut: number;
};

type Part = { method: "CASH" | "ACCOUNT" | "CREDIT"; amount: number };

function partsOf(row: LedgerRow): Part[] {
  if (row.stockOnly) return [];
  if (row.splits && row.splits.length > 0) return row.splits;
  if (!row.paymentMethod || row.paymentMethod === "MIXED") return [];
  return [{ method: row.paymentMethod, amount: row.amount }];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function summarizeMoney(rows: LedgerRow[]): MoneySummary {
  const empty = (): Flow => ({ in: 0, out: 0 });
  const s: MoneySummary = {
    moneyIn: 0,
    moneyOut: 0,
    cash: empty(),
    bank: empty(),
    udhaar: { given: 0, taken: 0 },
    byCategory: {
      SALES: empty(),
      UDHAAR: empty(),
      LOANS: empty(),
      DEALERS: empty(),
      EXPENSES: empty(),
      GRAIN: empty(),
    },
    entriesIn: 0,
    entriesOut: 0,
  };

  for (const row of rows) {
    // Bank → cash: the drawer gains what the bank loses; not money in
    // or out for the shop, so not in the totals or the breakdown.
    if (row.transfer) {
      s.cash.in += row.amount;
      s.bank.out += row.amount;
      continue;
    }
    const isIn = row.side === "CREDIT";
    let movedMoney = false;
    for (const part of partsOf(row)) {
      if (part.method === "CREDIT") {
        if (row.label.includes("imported")) continue;
        if (isIn) s.udhaar.given += part.amount;
        else s.udhaar.taken += part.amount;
        continue;
      }
      movedMoney = true;
      const bucket = part.method === "CASH" ? s.cash : s.bank;
      const cat = s.byCategory[row.category ?? "UDHAAR"];
      if (isIn) {
        bucket.in += part.amount;
        cat.in += part.amount;
        s.moneyIn += part.amount;
      } else {
        bucket.out += part.amount;
        cat.out += part.amount;
        s.moneyOut += part.amount;
      }
    }
    if (movedMoney) {
      if (isIn) s.entriesIn++;
      else s.entriesOut++;
    }
  }

  s.moneyIn = round(s.moneyIn);
  s.moneyOut = round(s.moneyOut);
  for (const f of [s.cash, s.bank, ...Object.values(s.byCategory)]) {
    f.in = round(f.in);
    f.out = round(f.out);
  }
  s.udhaar.given = round(s.udhaar.given);
  s.udhaar.taken = round(s.udhaar.taken);
  return s;
}

export async function moneyForRange(shopId: string, start: Date, end: Date) {
  const rows = await collectLedgerRows(shopId, { gte: start, lte: end });
  return { rows, summary: summarizeMoney(rows) };
}

// Physical cash in / out of the drawer for one day — what the cash
// register (opening + in − out = expected) is built on.
export async function cashForRange(shopId: string, start: Date, end: Date) {
  const { summary } = await moneyForRange(shopId, start, end);
  return summary.cash;
}
