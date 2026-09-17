"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import type { DebtRow, DebtSummary } from "./schema";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Every account with a positive balance on a non-tracksQuantity
// account type (Udhar/Regular — "any kind of money owed to the shop
// by a customer," excluding consignment/farmer accounts, which are a
// different relationship entirely and never show up here). Not
// cached — a shopkeeper recording a repayment expects this list to
// reflect it immediately.
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
export async function listDebtors(): Promise<DebtRow[]> {
  const shopId = await getCurrentShopId();

  const accounts = await db.customerAccount.findMany({
    where: {
      currentBalance: { gt: 0 },
      accountType: { tracksQuantity: false },
      customer: { shopId },
    },
    include: {
      customer: true,
      accountType: true,
      transactions: { orderBy: { transactionDate: "asc" } },
    },
  });

  const now = Date.now();

  const rows: DebtRow[] = accounts.map((account) => {
    const earliestTxn = account.transactions[0] ?? null;
    const debtSince = earliestTxn?.transactionDate ?? account.openedDate;
    const daysSince = Math.max(0, Math.floor((now - debtSince.getTime()) / MS_PER_DAY));

    const oldestDueDated = account.transactions.find((t) => t.dueDate !== null) ?? null;
    const isOverdue = oldestDueDated !== null && oldestDueDated.dueDate! < new Date();

    return {
      customerAccountId: account.id,
      customerId: account.customerId,
      customerName: account.customer.name,
      customerPhone: account.customer.phone,
      accountTypeName: account.accountType.name,
      kind: account.accountType.isLoan ? "LOAN" : "ON_ACCOUNT",
      balance: Number(account.currentBalance),
      debtSince,
      daysSince,
      dueDate: oldestDueDated?.dueDate ?? null,
      isOverdue,
    };
  });

  // Overdue first, then oldest debt first among the rest — per the
  // milestone's explicit default sort (crossed-due-date rows are a
  // different priority than ones that simply haven't been paid yet).
  rows.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.debtSince.getTime() - b.debtSince.getTime();
  });

  return rows;
}

export async function getDebtSummary(): Promise<DebtSummary> {
  const rows = await listDebtors();

  let totalLoans = 0;
  let totalOnAccount = 0;
  let overdueCount = 0;

  for (const row of rows) {
    if (row.kind === "LOAN") totalLoans += row.balance;
    else totalOnAccount += row.balance;
    if (row.isOverdue) overdueCount += 1;
  }

  return {
    totalLoans,
    totalOnAccount,
    grandTotal: totalLoans + totalOnAccount,
    debtorCount: rows.length,
    overdueCount,
  };
}
