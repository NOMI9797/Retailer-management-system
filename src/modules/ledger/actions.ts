"use server";

import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import { collectLedgerRows, type LedgerRow } from "./ledgerRows";

export type { LedgerRow, LedgerSide, LedgerCategory } from "./ledgerRows";

// Every money-moving record in the shop for a date range, split into
// money in (Credit) and money out (Debit) — the Daily sales page's two
// columns. Merges every source table the same way
// listBankAccountTransactions does, but across all payment methods
// (cash, account, Udhaar), not just bank movements.
//
// Rows another row already represents are skipped so nothing counts
// twice: a credit sale's own Udhaar posting (linkedSaleId), a dealer
// product purchase's ledger rows (linkedPurchaseId), and the ledger row
// of a sale made to a dealer (isDealerSale).
//
// customerId / areaId / accountTypeId narrow to customer-linked rows,
// so while any of them is active, rows with no customer behind them
// (expenses, dealers) are left out. search matches the name shown on
// the row (customer, dealer, or expense description).
export async function listDailyLedger(options?: {
  fromDate?: string;
  toDate?: string;
  customerId?: string;
  search?: string;
  areaId?: string;
  accountTypeId?: string;
}) {
  const shopId = await getCurrentShopId();
  const today = toLocalDateString(new Date());
  const fromDate = options?.fromDate || options?.toDate || today;
  const toDate = options?.toDate || options?.fromDate || today;
  const range = { gte: parseLocalDateStart(fromDate), lte: parseLocalDateEnd(toDate) };

  const rows = await collectLedgerRows(shopId, range, options);

  const search = options?.search?.trim().toLowerCase();
  const filtered = search
    ? rows.filter(
        (r) => r.counterpartyName.toLowerCase().includes(search) || (r.detail ?? "").toLowerCase().includes(search)
      )
    : rows;
  filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

  const credit = filtered.filter((r) => r.side === "CREDIT");
  const debit = filtered.filter((r) => r.side === "DEBIT");
  // A bank → cash withdrawal moves money between the shop's own pockets;
  // it's listed but not added to the totals.
  const sum = (list: LedgerRow[]) => list.reduce((s, r) => s + (r.transfer ? 0 : r.amount), 0);

  return { fromDate, toDate, credit, debit, creditTotal: sum(credit), debitTotal: sum(debit) };
}
