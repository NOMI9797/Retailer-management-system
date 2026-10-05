"use server";

import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "@/lib/cache";
import { parseLocalDateStart, parseLocalDateEnd } from "@/lib/utils";
import {
  bankAccountSchema,
  updateBankAccountSchema,
  type BankAccountInput,
  type UpdateBankAccountInput,
} from "./schema";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

const ENTITY = "bankAccounts";

export async function createBankAccount(input: BankAccountInput) {
  const shopId = await getCurrentShopId();
  const data = bankAccountSchema.parse(input);

  const bankAccount = await db.bankAccount.create({
    data: { shopId, name: data.name },
  });
  invalidateShopCache(ENTITY, shopId);
  return { ...bankAccount, currentBalance: Number(bankAccount.currentBalance) };
}

// Bank accounts barely change day to day — same short cache as
// Category/Unit/Area. currentBalance is a Prisma Decimal — unlike
// Unit/Area/Category (plain string fields only), this can't cross
// into a Client Component as-is (Next.js server/client boundary only
// accepts plain objects), so it's converted to a number here rather
// than trusting every caller (the Settings list manager, every
// payment-form picker) to remember to serialize it themselves.
export const listBankAccounts = cache(async (includeInactive = false) => {
  const shopId = await getCurrentShopId();

  const accounts = await cachedShopQuery(ENTITY, shopId, [includeInactive], () =>
    db.bankAccount.findMany({
      where: { shopId, isActive: includeInactive ? undefined : true },
      orderBy: { name: "asc" },
    })
  );

  return accounts.map((a) => ({ ...a, currentBalance: Number(a.currentBalance) }));
});

// Powers the Bank Accounts page — every account with its live
// balance, serialized to a plain number for the Client Component.
// Not cached (like getBalanceSummary in reports/actions.ts): a
// balance must always be queried fresh, never stale behind the
// 60-second list cache.
export async function getBankAccountBalances() {
  const shopId = await getCurrentShopId();

  const accounts = await db.bankAccount.findMany({
    where: { shopId },
    orderBy: { name: "asc" },
  });

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    isActive: a.isActive,
    currentBalance: Number(a.currentBalance),
  }));
}

export async function updateBankAccount(
  input: UpdateBankAccountInput
): Promise<ActionResult<{ id: string; name: string; isActive: boolean; currentBalance: number }>> {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateBankAccountSchema.parse(input);

  const existing = await db.bankAccount.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Bank account not found");

  const bankAccount = await db.bankAccount.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return ok({ ...bankAccount, currentBalance: Number(bankAccount.currentBalance) });
}

// The one shared implementation of "move money through a bank
// account's tracked balance" — every module that writes a row with
// paymentMethod = ACCOUNT calls this in the SAME transaction as that
// write, so a bank account's currentBalance can never drift out of
// sync with the rows that reference it. delta is signed from the
// bank account's own point of view: positive = money came INTO the
// account (a customer paid the shop via bank transfer), negative =
// money went OUT of it (the shop paid a customer/expense via bank
// transfer).
//
// A negative delta that would take the account below zero is
// rejected outright — per explicit shopkeeper decision, paying out of
// an account that doesn't have the money is a real data-entry mistake
// worth stopping, not a state worth recording with a warning color.
// Reads the account's current balance inside the same transaction
// (not a separate un-transacted read) so this check is safe under
// concurrent writes to the same account.
export async function postToBankAccount(
  tx: Prisma.TransactionClient,
  bankAccountId: string,
  delta: number
) {
  if (delta < 0) {
    const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId } });
    const currentBalance = Number(account.currentBalance);
    const shortfall = Math.abs(delta) - currentBalance;
    if (shortfall > 0.01) {
      throw new Error(
        currentBalance > 0
          ? `Not enough balance in ${account.name} — it has Rs ${currentBalance.toLocaleString()}, short by Rs ${shortfall.toLocaleString()} for this payment. Choose a different account or reduce the amount.`
          : `Not enough balance in ${account.name} — it has no funds right now, short by Rs ${shortfall.toLocaleString()} for this payment. Choose a different account or reduce the amount.`
      );
    }
  }

  await tx.bankAccount.update({
    where: { id: bankAccountId },
    data: { currentBalance: { increment: delta } },
  });
}

export type BankAccountTransactionRow = {
  id: string;
  date: Date;
  bankAccountId: string;
  bankAccountName: string;
  direction: "IN" | "OUT";
  amount: number;
  source: string;
  description: string;
};

// Every single row, across every feature in the app, where money
// actually moved through a bank account — the one merged, combined
// feed powering the Bank Accounts page's transaction history. Pulls
// from every table that carries a bankAccountId (see each model's
// schema comment: "same convention as AccountTransaction.
// bankAccountId"): AccountTransaction (Udhaar repayments, Long-term/
// Shop-Borrowed loans and their repayments, grain debt payments),
// DailySalePayment (sale payments via Account), GrainSaleCreditPayment
// (customer grain-Udhaar repayments via Account), Expense (expenses
// paid via Account), ExpensePayment (expense-debt repayments via
// Account), DealerProductPurchase (bulk purchases paid via Account),
// and DealerTransaction (dealer Udhaar repayments via Account — see
// payDealerDebt). Each row is normalized to one shape with a signed
// direction from the BANK ACCOUNT's own point of view (IN = money
// came into it, OUT = money left it) — the exact same sign convention
// postToBankAccount's delta already uses, derived here the same way
// each call site derives it, not inferred from amount sign.
//
// No database-level pagination across seven different tables with
// different date columns — fetch every matching row from each, merge,
// then paginate the combined list in memory. Same approach
// listDailySales already uses for its two-table merge; fine at a
// single shop's volume, revisit if this ever needs to scale past that.
export async function listBankAccountTransactions(options?: {
  bankAccountId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? 50;

  const dateFilter = {
    gte: options?.fromDate ? parseLocalDateStart(options.fromDate) : undefined,
    lte: options?.toDate ? parseLocalDateEnd(options.toDate) : undefined,
  };
  const bankAccountFilter = options?.bankAccountId
    ? { bankAccountId: options.bankAccountId }
    : { bankAccountId: { not: null } };

  const [
    accountTxns,
    salePayments,
    creditPayments,
    expenses,
    expensePayments,
    dealerPurchases,
    dealerTxns,
  ] = await Promise.all([
    db.accountTransaction.findMany({
      where: { ...bankAccountFilter, transactionDate: dateFilter, customerAccount: { customer: { shopId } } },
      include: { bankAccount: true, customerAccount: { include: { customer: true } } },
    }),
    db.dailySalePayment.findMany({
      where: { ...bankAccountFilter, visitAt: dateFilter, dailySale: { shopId } },
      include: { bankAccount: true, dailySale: { include: { customer: true, dealer: true } } },
    }),
    db.grainSaleCreditPayment.findMany({
      where: { ...bankAccountFilter, paidAt: dateFilter, dailySaleItem: { product: { shopId } } },
      include: {
        bankAccount: true,
        dailySaleItem: {
          include: { product: true, dailySale: { include: { customer: true, dealer: true } } },
        },
      },
    }),
    db.expense.findMany({
      where: { ...bankAccountFilter, expenseDate: dateFilter, shopId },
      include: { bankAccount: true, monthlyExpenseType: true },
    }),
    db.expensePayment.findMany({
      where: { ...bankAccountFilter, paidAt: dateFilter, expense: { shopId } },
      include: { bankAccount: true, expense: true },
    }),
    db.dealerProductPurchase.findMany({
      where: { ...bankAccountFilter, purchaseDate: dateFilter, dealer: { shopId } },
      include: { bankAccount: true, dealer: true, product: true },
    }),
    db.dealerTransaction.findMany({
      // isSettledPurchase rows are excluded — they're the SAME Account
      // payment already surfaced above via dealerPurchases
      // (DealerProductPurchase/GrainBatch's own bankAccountId); without
      // this filter a Cash/Account dealer purchase would double-count
      // here (see isSettledPurchase's schema comment for why that row
      // exists at all — Cash Flow visibility, not a second real
      // movement).
      where: {
        ...bankAccountFilter,
        isSettledPurchase: false,
        transactionDate: dateFilter,
        dealerAccount: { dealer: { shopId } },
      },
      include: { bankAccount: true, dealerAccount: { include: { dealer: true } } },
    }),
  ]);

  const rows: BankAccountTransactionRow[] = [];

  for (const txn of accountTxns) {
    if (!txn.bankAccount) continue;
    // isShopBorrowed inverts the usual OUT/IN meaning (see its schema
    // comment) — OUT there means cash coming INTO the shop (it's
    // borrowing), IN means the shop paying it back out. Every other
    // bucket on this table (Regular/Long-term Udhaar, grain debt)
    // keeps the normal meaning: OUT = money leaving the shop (a loan
    // given, or paying a customer for grain), IN = money coming in (a
    // repayment collected).
    const direction: "IN" | "OUT" = txn.isShopBorrowed
      ? txn.direction === "OUT"
        ? "IN"
        : "OUT"
      : txn.direction === "OUT"
        ? "OUT"
        : "IN";
    const customerName = txn.customerAccount.customer.name;
    rows.push({
      id: txn.id,
      date: txn.transactionDate,
      bankAccountId: txn.bankAccount.id,
      bankAccountName: txn.bankAccount.name,
      direction,
      amount: Number(txn.amount),
      source: txn.isShopBorrowed
        ? direction === "IN"
          ? "Borrowed from customer"
          : "Repaid to customer"
        : txn.quantity !== null
          ? direction === "OUT"
            ? "Grain settlement"
            : "Grain debt repayment"
          : direction === "OUT"
            ? "Loan given"
            : "Udhaar repayment",
      description: customerName,
    });
  }

  for (const payment of salePayments) {
    if (!payment.bankAccount) continue;
    rows.push({
      id: payment.id,
      date: payment.visitAt,
      bankAccountId: payment.bankAccount.id,
      bankAccountName: payment.bankAccount.name,
      direction: "IN",
      amount: Number(payment.amount),
      source: "Sale",
      // Exactly one of customer/dealer is set on a DailySale (see its
      // schema comment) — a sale paid via Account can come from
      // either a customer or a bulk dealer.
      description: payment.dailySale.customer?.name ?? payment.dailySale.dealer?.name ?? "Unknown buyer",
    });
  }

  for (const payment of creditPayments) {
    if (!payment.bankAccount) continue;
    const buyerName =
      payment.dailySaleItem.dailySale.customer?.name ?? payment.dailySaleItem.dailySale.dealer?.name ?? "Unknown buyer";
    rows.push({
      id: payment.id,
      date: payment.paidAt,
      bankAccountId: payment.bankAccount.id,
      bankAccountName: payment.bankAccount.name,
      direction: "IN",
      amount: Number(payment.amount),
      source: "Grain Udhaar repayment",
      description: `${buyerName} — ${payment.dailySaleItem.product.name}`,
    });
  }

  for (const expense of expenses) {
    if (!expense.bankAccount) continue;
    rows.push({
      id: expense.id,
      date: expense.expenseDate,
      bankAccountId: expense.bankAccount.id,
      bankAccountName: expense.bankAccount.name,
      direction: "OUT",
      amount: Number(expense.amount),
      source: expense.expenseType === "MONTHLY" ? "Monthly expense" : "Daily expense",
      description: expense.monthlyExpenseType?.name ?? expense.description,
    });
  }

  for (const payment of expensePayments) {
    if (!payment.bankAccount) continue;
    rows.push({
      id: payment.id,
      date: payment.paidAt,
      bankAccountId: payment.bankAccount.id,
      bankAccountName: payment.bankAccount.name,
      direction: "OUT",
      amount: Number(payment.amount),
      source: "Expense Udhaar repayment",
      description: payment.expense.description,
    });
  }

  for (const purchase of dealerPurchases) {
    if (!purchase.bankAccount) continue;
    rows.push({
      id: purchase.id,
      date: purchase.purchaseDate,
      bankAccountId: purchase.bankAccount.id,
      bankAccountName: purchase.bankAccount.name,
      direction: "OUT",
      amount: Number(purchase.quantity) * Number(purchase.costPrice),
      source: "Dealer purchase",
      description: `${purchase.dealer.name} — ${purchase.product.name}`,
    });
  }

  for (const txn of dealerTxns) {
    if (!txn.bankAccount) continue;
    // Every dealer bank posting is money leaving the shop (see
    // postToBankAccount's three dealer call sites: a Products/Grain
    // purchase paid via Account, or payDealerDebt paying one down) —
    // dealers never bring money INTO the shop's bank account through
    // this table (a dealer SALE's Credit posting never touches a bank
    // account at all, since Credit is never paid via Account by
    // definition).
    rows.push({
      id: txn.id,
      date: txn.transactionDate,
      bankAccountId: txn.bankAccount.id,
      bankAccountName: txn.bankAccount.name,
      direction: "OUT",
      amount: Number(txn.amount),
      source: "Dealer Udhaar repayment",
      description: txn.dealerAccount.dealer.name,
    });
  }

  rows.sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalCount = rows.length;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: paged,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}
