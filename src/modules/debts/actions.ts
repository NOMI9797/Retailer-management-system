"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import type { DebtRow, DebtSummary, DebtBucket } from "./schema";
import type { Prisma } from "@prisma/client";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

type AccountWithTransactions = Prisma.CustomerAccountGetPayload<{
  include: { customer: true; accountType: true; transactions: true };
}>;

// Shared by listDebtors and getCustomerUdhaarSummary — one
// implementation of "borrowed/paid/overdue math for this account," so
// the shop-wide Udhaar page and the Udhaar Clearance tab's per-
// customer summary can never disagree about the same numbers.
//
// `bucket` scopes every figure (balance/borrowed/paid/debtSince/
// overdue) to ONLY that bucket's transactions — REGULAR and LONG_TERM
// are fully isolated views over the same account, per the "separate
// totals, never combined" decision (see DebtBucket's schema comment).
// The returned `balance` is therefore this bucket's own borrowed-paid
// figure, NOT account.currentBalance (which is the two buckets
// combined) — the two only agree when a customer has no long-term
// loans at all.
function summarizeAccount(account: AccountWithTransactions, bucket: DebtBucket): DebtRow {
  const now = Date.now();
  const wantsLongTerm = bucket === "LONG_TERM";
  const sortedTxns = account.transactions
    .filter((t) => t.isLongTerm === wantsLongTerm)
    .sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());

  const earliestTxn = sortedTxns[0] ?? null;
  const debtSince = earliestTxn?.transactionDate ?? account.openedDate;
  const daysSince = Math.max(0, Math.floor((now - debtSince.getTime()) / MS_PER_DAY));

  const oldestDueDated = sortedTxns.find((t) => t.dueDate !== null) ?? null;
  const isOverdue = oldestDueDated !== null && oldestDueDated.dueDate! < new Date();

  let totalBorrowed = 0;
  let totalPaid = 0;
  for (const txn of sortedTxns) {
    if (txn.direction === "OUT") totalBorrowed += Number(txn.amount);
    else totalPaid += Number(txn.amount);
  }

  return {
    customerAccountId: account.id,
    customerId: account.customerId,
    customerName: account.customer.name,
    customerPhone: account.customer.phone,
    accountTypeName: account.accountType.name,
    kind: account.accountType.isLoan ? "LOAN" : "ON_ACCOUNT",
    balance: totalBorrowed - totalPaid,
    totalBorrowed,
    totalPaid,
    debtSince,
    daysSince,
    dueDate: oldestDueDated?.dueDate ?? null,
    isOverdue,
  };
}

// Every account with a positive balance IN THE GIVEN BUCKET, on a
// non-tracksQuantity account type (Udhaar/Regular — "any kind of
// money owed to the shop by a customer," excluding consignment/farmer
// accounts, which are a different relationship entirely and never
// show up here). Not cached — a shopkeeper recording a repayment
// expects this list to reflect it immediately.
//
// "Debt since" and the overdue flag are both deliberately simplified,
// per the milestone's explicit scope boundary: once partial
// repayments happen, a running balance doesn't cleanly map back to
// which original loan it's paying off, so this doesn't attempt full
// payment allocation. Instead: "debt since" is the account's EARLIEST
// transaction (when the relationship started owing), and "overdue" is
// keyed off the earliest transaction that actually carries a dueDate
// (the oldest loan with a due date set) — if that date has passed and
// the account still owes money, the whole account is flagged.
//
// currentBalance can't be filtered at the database level per-bucket
// (it's a shared total across both), so this fetches every account
// with ANY activity and filters to bucket-positive-balance in memory
// — fine at a single shop's scale.
export async function listDebtors(bucket: DebtBucket = "REGULAR"): Promise<DebtRow[]> {
  const shopId = await getCurrentShopId();

  const accounts = await db.customerAccount.findMany({
    where: {
      accountType: { tracksQuantity: false },
      customer: { shopId },
      transactions: { some: { isLongTerm: bucket === "LONG_TERM" } },
    },
    include: {
      customer: true,
      accountType: true,
      transactions: { orderBy: { transactionDate: "asc" } },
    },
  });

  const rows: DebtRow[] = accounts.map((a) => summarizeAccount(a, bucket)).filter((row) => row.balance > 0);

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

// One customer's Udhaar account summary — powers the Udhaar Clearance
// tab's "how much borrowed, how much cleared, how much remaining"
// view after a shopkeeper picks a customer. Unlike listDebtors, this
// is NOT filtered to currentBalance > 0 — a fully cleared customer
// (balance 0) still needs their history shown so a repayment can be
// verified as complete, not just customers who currently owe money.
// Returns null if the customer has no Udhaar account yet (they've
// never taken a loan or made a Credit sale) — the caller decides how
// to present that ("no Udhaar activity yet" rather than a payment
// form with nothing to pay against).
export async function getCustomerUdhaarSummary(
  customerId: string,
  bucket: DebtBucket = "REGULAR"
): Promise<DebtRow | null> {
  const shopId = await getCurrentShopId();

  const account = await db.customerAccount.findFirst({
    where: {
      customerId,
      customer: { shopId },
      accountType: { isLoan: true },
    },
    include: {
      customer: true,
      accountType: true,
      transactions: { orderBy: { transactionDate: "asc" } },
    },
  });

  if (!account) return null;
  return summarizeAccount(account, bucket);
}
