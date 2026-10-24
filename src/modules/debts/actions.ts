"use server";

import { getCurrentShopId } from "@/lib/tenant";
import { loadCustomerUdhaar, loadShopOwesCustomer, type CustomerUdhaar, type ShopOwesCustomer } from "./udhaarLedger";
import type { DebtRow, DebtSummary, DebtBucket } from "./schema";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// One customer's figures for one bucket (Regular/Daily or Long-term),
// read off their Udhaar ledger (see udhaarLedger.ts): payments are one
// pooled pot spread over every entry oldest-first, so a bucket's
// "paid" is whatever of that pot landed on its entries. debtSince and
// the overdue flag come from the oldest entry still unpaid (overdue =
// its due date plus the week's grace has passed — GRACE_PERIOD_DAYS).
function summarizeBucket(udhaar: CustomerUdhaar, bucket: DebtBucket): DebtRow {
  const now = Date.now();
  const charges = udhaar.charges.filter((c) => c.isLongTerm === (bucket === "LONG_TERM"));
  const unpaid = charges.filter((c) => c.remaining > 0.01);

  const debtSince = (unpaid[0] ?? charges[0])?.date ?? new Date(now);
  const oldestDueDated = unpaid.find((c) => c.dueDate !== null) ?? null;

  return {
    customerAccountId: udhaar.udhaarAccountId ?? charges[0]?.customerAccountId ?? "",
    customerId: udhaar.customerId,
    customerName: udhaar.customerName,
    customerPhone: udhaar.customerPhone,
    accountTypeName: "Udhaar",
    kind: charges.some((c) => c.isLoanAccount) ? "LOAN" : "ON_ACCOUNT",
    bucket,
    balance: unpaid.reduce((sum, c) => sum + c.remaining, 0),
    references: [...new Set(charges.filter((c) => c.reference).map((c) => c.reference!))],
    totalBorrowed: charges.reduce((sum, c) => sum + c.amount, 0),
    totalPaid: charges.reduce((sum, c) => sum + c.paid, 0),
    debtSince,
    daysSince: Math.max(0, Math.floor((now - debtSince.getTime()) / MS_PER_DAY)),
    dueDate: oldestDueDated?.dueDate ?? null,
    isOverdue: unpaid.some((c) => c.isOverdue),
  };
}

// Every customer still owing something IN THE GIVEN BUCKET. Not
// cached — a shopkeeper recording a repayment expects this list to
// reflect it immediately.
export async function listDebtors(bucket: DebtBucket = "REGULAR"): Promise<DebtRow[]> {
  const shopId = await getCurrentShopId();
  const ledgers = await loadCustomerUdhaar(shopId);

  const rows: DebtRow[] = [...ledgers.values()]
    .map((u) => summarizeBucket(u, bucket))
    .filter((row) => row.balance > 0.01);

  // Overdue first, then oldest debt first among the rest — per the
  // milestone's explicit default sort (crossed-due-date rows are a
  // different priority than ones that simply haven't been paid yet).
  rows.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.debtSince.getTime() - b.debtSince.getTime();
  });

  return rows;
}

export async function getDebtSummary(bucket: DebtBucket = "REGULAR"): Promise<DebtSummary> {
  const rows = await listDebtors(bucket);

  let totalLoans = 0;
  let totalOnAccount = 0;
  let overdueCount = 0;
  let totalPaidOverall = 0;

  for (const row of rows) {
    if (row.kind === "LOAN") totalLoans += row.balance;
    else totalOnAccount += row.balance;
    if (row.isOverdue) overdueCount += 1;
    totalPaidOverall += row.totalPaid;
  }

  return {
    totalLoans,
    totalOnAccount,
    grandTotal: totalLoans + totalOnAccount,
    debtorCount: rows.length,
    overdueCount,
    totalPaidOverall,
  };
}

// The Defaulter tab's data source — every currently-overdue debtor
// from BOTH buckets combined into one consolidated list, per the
// "same rule everywhere, Defaulter is just the consolidated view"
// decision. A defaulter's loan still shows up normally on its own
// Regular or Long-term tab too (this is a read-only view layered on
// top, nothing is removed from where it would otherwise appear).
// Sorted oldest-overdue first — the ones that have been sitting
// longest past their grace period need attention soonest.
export async function listDefaulters(): Promise<DebtRow[]> {
  const [regular, longTerm] = await Promise.all([listDebtors("REGULAR"), listDebtors("LONG_TERM")]);

  const defaulters = [...regular, ...longTerm].filter((row) => row.isOverdue);
  defaulters.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));

  return defaulters;
}

// One customer's figures for one bucket — e.g. the customer page's
// overall totals. Null if they have no Udhaar entries at all.
export async function getCustomerUdhaarSummary(
  customerId: string,
  bucket: DebtBucket = "REGULAR"
): Promise<DebtRow | null> {
  const shopId = await getCurrentShopId();
  const udhaar = (await loadCustomerUdhaar(shopId, customerId)).get(customerId);
  return udhaar ? summarizeBucket(udhaar, bucket) : null;
}

// One customer's whole Udhaar ledger — every entry oldest first with
// its paid/remaining after their pooled payments are spread over them
// — for the single-payment Udhaar clearance screen.
export async function getCustomerUdhaarLedger(customerId: string): Promise<CustomerUdhaar | null> {
  const shopId = await getCurrentShopId();
  return (await loadCustomerUdhaar(shopId, customerId)).get(customerId) ?? null;
}

// What the shop owes one customer, entry by entry (borrowed money and
// grain bought on Udhaar) with the shop's pooled repayments spread
// over them oldest first — for the single-payment "shop pays customer"
// Udhaar clearance screen.
export async function getShopOwesCustomerLedger(customerId: string): Promise<ShopOwesCustomer | null> {
  const shopId = await getCurrentShopId();
  return (await loadShopOwesCustomer(shopId, customerId)).get(customerId) ?? null;
}
