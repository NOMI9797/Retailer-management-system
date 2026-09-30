"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, toLocalDateString } from "@/lib/utils";
import {
  customerSchema,
  updateCustomerSchema,
  recordAccountTransactionSchema,
  createLongTermLoanSchema,
  createShopBorrowedLoanSchema,
  payShopBorrowedLoanSchema,
  type CustomerInput,
  type UpdateCustomerInput,
  type RecordAccountTransactionInput,
  type CreateLongTermLoanInput,
  type CreateShopBorrowedLoanInput,
  type PayShopBorrowedLoanInput,
} from "./schema";

const DEFAULT_PAGE_SIZE = 50;

// Dedupes by name within the shop before creating — this is what
// keeps "the same customer's whole history under one account" true
// (per the milestone's core rule) even when a customer is added twice
// by mistake, e.g. once from the Customers page and again from Daily
// Sales' quick-add for a returning customer whose name wasn't picked
// from the search results. On a match, any newly-selected account
// types are attached to the EXISTING customer (skipping ones they
// already hold) instead of spawning a second Customer row with its
// own separate balance/history.
//
// Account types are simplified for now, per the "just keep Udhaar
// account" decision: every customer gets a Regular account
// automatically (a plain, unwired tag — no picker shown anywhere for
// this), and an Udhaar account is only ever created later, on demand,
// the first time they actually take a loan or make a Credit sale (see
// applyPaymentSplit in daily-sales/actions.ts and
// recordAccountTransaction). accountTypeIds still works exactly as
// before for any OTHER account type a caller explicitly passes —
// nothing about that capability was removed, only the New Sale/Add
// Customer forms no longer show a picker for it.
export async function createCustomer(input: CustomerInput) {
  const shopId = await getCurrentShopId();
  const data = customerSchema.parse(input);

  const regularType = await db.accountType.findFirst({ where: { shopId, code: "REGULAR" } });
  const accountTypeIds = regularType
    ? Array.from(new Set([regularType.id, ...data.accountTypeIds]))
    : data.accountTypeIds;

  const existing = await db.customer.findFirst({
    where: { shopId, name: { equals: data.name, mode: "insensitive" } },
    include: { accounts: true },
  });

  if (existing) {
    const heldTypeIds = new Set(existing.accounts.map((a) => a.accountTypeId));
    const newTypeIds = accountTypeIds.filter((id) => !heldTypeIds.has(id));
    if (newTypeIds.length > 0) {
      await db.customerAccount.createMany({
        data: newTypeIds.map((accountTypeId) => ({ customerId: existing.id, accountTypeId })),
      });
    }
    return existing;
  }

  // This single call is the "no duplication" rule in practice: a
  // customer created here from Daily Sales is the same record the
  // Customer Accounts screen reads — there is no second write.
  const customer = await db.customer.create({
    data: {
      shopId,
      name: data.name,
      phone: data.phone,
      areaId: data.areaId,
      notes: data.notes,
      accounts: {
        create: accountTypeIds.map((accountTypeId) => ({
          accountTypeId,
        })),
      },
    },
  });

  return customer;
}

// Attaches an additional account type to an existing customer — e.g.
// a regular walk-in buyer who's now also depositing grain for
// safekeeping needs a second account without losing their existing
// Regular one. No-ops if they already hold that account type (picking
// it again from the UI shouldn't create a second row of the same
// type).
export async function addCustomerAccount(customerId: string, accountTypeId: string) {
  const shopId = await getCurrentShopId();

  const customer = await db.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new Error("Customer not found");

  const accountType = await db.accountType.findFirst({ where: { id: accountTypeId, shopId } });
  if (!accountType) throw new Error("Account type not found");

  const existing = await db.customerAccount.findFirst({ where: { customerId, accountTypeId } });
  const account = existing ?? (await db.customerAccount.create({ data: { customerId, accountTypeId } }));

  // currentBalance is a Prisma Decimal — must be a plain number before
  // crossing into the Client Component that calls this (CustomerPicker).
  return { ...account, currentBalance: Number(account.currentBalance) };
}

// Swaps which account type an existing account slot represents (e.g.
// a customer's account was set up as "Regular" but should actually be
// "Udhaar") rather than detaching one type and attaching another,
// which would lose the account's id/history. Blocked whenever the
// account has any balance or transactions — a swap would silently
// reattribute that history to a different account type, which is
// exactly the kind of financial-record corruption CLAUDE.md's "ask
// rather than guess" rule exists to prevent. The shopkeeper must
// resolve the balance first (e.g. via a correcting transaction) if
// they truly need to change it.
export async function changeCustomerAccountType(customerAccountId: string, newAccountTypeId: string) {
  const shopId = await getCurrentShopId();

  const account = await db.customerAccount.findFirst({
    where: { id: customerAccountId, customer: { shopId } },
    include: { transactions: true },
  });
  if (!account) throw new Error("Account not found");

  if (Number(account.currentBalance) !== 0 || account.transactions.length > 0) {
    throw new Error(
      "This account has a balance or transaction history — clear it before changing its account type."
    );
  }

  const newAccountType = await db.accountType.findFirst({ where: { id: newAccountTypeId, shopId } });
  if (!newAccountType) throw new Error("Account type not found");

  const alreadyHeld = await db.customerAccount.findFirst({
    where: { customerId: account.customerId, accountTypeId: newAccountTypeId },
  });
  if (alreadyHeld) throw new Error("This customer already has an account of that type");

  const updated = await db.customerAccount.update({
    where: { id: customerAccountId },
    data: { accountTypeId: newAccountTypeId },
  });

  return { ...updated, currentBalance: Number(updated.currentBalance) };
}

// Permanently removes an account slot from a customer — blocked
// whenever it has any balance or transaction history, for the same
// reason changeCustomerAccountType blocks a swap: deleting an account
// with real financial history attached would silently erase it.
export async function removeCustomerAccount(customerAccountId: string) {
  const shopId = await getCurrentShopId();

  const account = await db.customerAccount.findFirst({
    where: { id: customerAccountId, customer: { shopId } },
    include: { transactions: true },
  });
  if (!account) throw new Error("Account not found");

  if (Number(account.currentBalance) !== 0 || account.transactions.length > 0) {
    throw new Error(
      "This account has a balance or transaction history — it can't be removed."
    );
  }

  await db.customerAccount.delete({ where: { id: customerAccountId } });
}

export async function updateCustomer(input: UpdateCustomerInput) {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateCustomerSchema.parse(input);

  const existing = await db.customer.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Customer not found");

  return db.customer.update({ where: { id }, data });
}

// Paginated + filterable by area, searchable by name/phone — the
// list view's data source. page.tsx (a Server Component) calls this
// directly; there is no client-side fetching hook for it.
export async function listCustomers(options?: {
  search?: string;
  areaId?: string;
  accountTypeId?: string;
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = {
    shopId,
    areaId: options?.areaId || undefined,
    accounts: options?.accountTypeId ? { some: { accountTypeId: options.accountTypeId } } : undefined,
    ...(options?.search
      ? {
          OR: [
            { name: { contains: options.search, mode: "insensitive" as const } },
            { phone: { contains: options.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [customers, totalCount] = await Promise.all([
    db.customer.findMany({
      where,
      include: { area: true, accounts: { include: { accountType: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.customer.count({ where }),
  ]);

  return {
    // accounts[].currentBalance is a Prisma Decimal — must be a plain
    // number before crossing into a Client Component (this list feeds
    // the Daily Sales customer picker, which is client-side). Same
    // fix as getCustomer below.
    customers: customers.map((customer) => ({
      ...customer,
      accounts: customer.accounts.map((account) => ({
        ...account,
        currentBalance: Number(account.currentBalance),
      })),
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

// The Customers page's stat row — shop-wide totals, unaffected by
// whatever the filter bar/table below are currently narrowed to, so
// the shopkeeper always has a stable overview snapshot.
export async function getCustomerStats() {
  const shopId = await getCurrentShopId();

  const [totalCustomers, withAccount, areasCovered] = await Promise.all([
    db.customer.count({ where: { shopId } }),
    db.customer.count({ where: { shopId, accounts: { some: {} } } }),
    db.area.count({ where: { shopId, customers: { some: {} } } }),
  ]);

  return { totalCustomers, withAccount, areasCovered };
}

// The customer detail/ledger page's data source — every account this
// customer holds, each with its transaction history, so the running
// balance and full history render from one fetch with no further
// round trips per account.
export async function getCustomer(id: string) {
  const shopId = await getCurrentShopId();

  const customer = await db.customer.findFirst({
    where: { id, shopId },
    include: {
      area: true,
      accounts: {
        include: {
          accountType: true,
          fieldValues: { include: { accountTypeField: true } },
          transactions: { orderBy: { transactionDate: "desc" } },
        },
        orderBy: { openedDate: "asc" },
      },
    },
  });
  if (!customer) throw new Error("Customer not found");

  // Decimal fields (currentBalance, amount, quantity) must be plain
  // numbers before crossing into a Client Component — same reasoning
  // as serializeDecimals in the products module.
  return {
    ...customer,
    accounts: customer.accounts.map((account) => ({
      ...account,
      currentBalance: Number(account.currentBalance),
      transactions: account.transactions.map((txn) => ({
        ...txn,
        amount: Number(txn.amount),
        quantity: txn.quantity ? Number(txn.quantity) : null,
      })),
    })),
  };
}

// Manually records a loan given or a repayment received on a Udhaar or
// Regular account — the one write path the Customer Accounts ledger
// view and the Debts page's "record repayment" quick action both
// share. Every account uses the debt convention below: OUT increments
// (customer owes more), IN decrements (customer paid down). A
// transfer-purchase's payment (see stock/actions.ts:
// createTransferPurchase) posts the OPPOSITE-meaning OUT — shop owes
// the customer, decrementing balance — directly, bypassing this
// function entirely, so it never needs to be special-cased here.
export async function recordAccountTransaction(input: RecordAccountTransactionInput) {
  const shopId = await getCurrentShopId();
  const data = recordAccountTransactionSchema.parse(input);

  const account = await db.customerAccount.findFirst({
    where: { id: data.customerAccountId, customer: { shopId } },
    include: { accountType: true, transactions: true },
  });
  if (!account) throw new Error("Account not found");

  // A repayment can't exceed what's actually remaining IN THIS
  // BUCKET — Regular and Long-term are isolated (see
  // AccountTransaction.isLongTerm's schema comment), so a customer
  // with room on one bucket can't accidentally overpay the other.
  // Only checked on IN (a loan given has no such ceiling).
  if (data.direction === "IN") {
    const bucketTxns = account.transactions.filter((t) => t.isLongTerm === data.isLongTerm);
    const bucketBalance = bucketTxns.reduce(
      (sum, t) => sum + (t.direction === "OUT" ? Number(t.amount) : -Number(t.amount)),
      0
    );
    if (data.amount > bucketBalance + 0.01) {
      const bucketLabel = data.isLongTerm ? "Long-term Udhaar" : "Regular/Daily Udhaar";
      throw new Error(
        `This repayment (Rs ${data.amount}) is more than what's remaining on ${bucketLabel} (Rs ${bucketBalance}) — a payment can't exceed what's actually owed.`
      );
    }
  }

  const txn = await db.$transaction(async (tx) => {
    const created = await tx.accountTransaction.create({
      data: {
        customerAccountId: data.customerAccountId,
        direction: data.direction,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        dueDate: data.direction === "OUT" && data.dueDate ? parseLocalDateStart(data.dueDate) : null,
        isLongTerm: data.isLongTerm,
        notes: data.notes || null,
      },
    });

    // Debt convention (see the comment above): OUT (loan given) means
    // the customer now owes MORE, so balance increments; IN
    // (repayment) means they owe LESS, so balance decrements.
    // describeBalance's "positive = customer owes shop" convention
    // stays correct either way.
    await tx.customerAccount.update({
      where: { id: data.customerAccountId },
      data: {
        currentBalance: data.direction === "OUT" ? { increment: data.amount } : { decrement: data.amount },
      },
    });

    return created;
  });

  // Decimal/Date fields aren't plain objects — must be serialized
  // before crossing back into the Client Component that calls this
  // (RecordAccountTransactionModal), same reasoning as every other
  // action returning Prisma rows to a client caller.
  return {
    ...txn,
    amount: Number(txn.amount),
    quantity: txn.quantity ? Number(txn.quantity) : null,
  };
}

// A deliberate cash loan with a chosen term (e.g. "3 months"), as
// opposed to Regular/Daily Udhaar which accrues naturally from Credit
// sales with no fixed term — the shopkeeper picks a duration instead
// of typing a due date directly, and the return date is always
// DERIVED from today + that duration, never manually entered. Takes
// customerId (not customerAccountId): this can be the very first
// Udhaar activity a customer ever has, so it auto-finds-or-creates
// their Udhar account first, same pattern applyPaymentSplit already
// uses for Credit sales. Writes through recordAccountTransaction
// under the hood (direction OUT, isLongTerm: true) so there's still
// exactly one implementation of the balance math, not a second one
// duplicated here.
export async function createLongTermLoan(input: CreateLongTermLoanInput) {
  const shopId = await getCurrentShopId();
  const data = createLongTermLoanSchema.parse(input);

  const udharType = await db.accountType.findFirst({ where: { shopId, isLoan: true } });
  if (!udharType) {
    throw new Error("No loan-type account configured for this shop — mark an account type as a loan in Settings.");
  }

  let account = await db.customerAccount.findFirst({
    where: { customerId: data.customerId, accountTypeId: udharType.id },
  });
  if (!account) {
    account = await db.customerAccount.create({
      data: { customerId: data.customerId, accountTypeId: udharType.id },
    });
  }

  const dueDate = new Date();
  if (data.durationUnit === "DAYS") dueDate.setDate(dueDate.getDate() + data.durationValue);
  else if (data.durationUnit === "WEEKS") dueDate.setDate(dueDate.getDate() + data.durationValue * 7);
  else dueDate.setMonth(dueDate.getMonth() + data.durationValue);

  return recordAccountTransaction({
    customerAccountId: account.id,
    direction: "OUT",
    amount: data.amount,
    paymentMethod: data.paymentMethod,
    dueDate: toLocalDateString(dueDate),
    notes: data.notes,
    isLongTerm: true,
  });
}

// ── Shop (Udhaar): the shop borrowing cash FROM a customer ──
// The mirror of Long-term Udhaar — same "pick a customer, an amount,
// and a duration; due date is always derived" shape, but here the
// SHOP is the borrower. Posts directly to AccountTransaction (NOT
// through recordAccountTransaction) for the same reason
// payCustomerForGrain/payGrainDebt do: this bucket's OUT/IN meaning
// (shop borrows / shop repays) is the opposite of every other
// bucket's convention, and currentBalance is deliberately left
// untouched — see AccountTransaction.isShopBorrowed's schema comment
// on why this must never net against the customer's real Udhaar
// balance. Uses the same Udhar/loan account every other bucket
// shares (auto-created if this is the customer's first Udhaar
// activity of any kind), since isShopBorrowed alone is enough to keep
// this bucket's totals fully isolated in every query that reads it.

export async function createShopBorrowedLoan(input: CreateShopBorrowedLoanInput) {
  const shopId = await getCurrentShopId();
  const data = createShopBorrowedLoanSchema.parse(input);

  const udharType = await db.accountType.findFirst({ where: { shopId, isLoan: true } });
  if (!udharType) {
    throw new Error("No loan-type account configured for this shop — mark an account type as a loan in Settings.");
  }

  const customer = await db.customer.findFirst({ where: { id: data.customerId, shopId } });
  if (!customer) throw new Error("Customer not found");

  let account = await db.customerAccount.findFirst({
    where: { customerId: data.customerId, accountTypeId: udharType.id },
  });
  if (!account) {
    account = await db.customerAccount.create({
      data: { customerId: data.customerId, accountTypeId: udharType.id },
    });
  }

  const dueDate = new Date();
  if (data.durationUnit === "DAYS") dueDate.setDate(dueDate.getDate() + data.durationValue);
  else if (data.durationUnit === "WEEKS") dueDate.setDate(dueDate.getDate() + data.durationValue * 7);
  else dueDate.setMonth(dueDate.getMonth() + data.durationValue);

  await db.accountTransaction.create({
    data: {
      customerAccountId: account.id,
      direction: "OUT",
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      dueDate,
      notes: data.notes || null,
      isShopBorrowed: true,
    },
  });
}

// Every customer the shop currently owes money to via a Shop
// Borrowed loan — the Udhaar (Shop) → Borrowed from Customers tab's
// table data source. Same balance/overdue math as summarizeAccount,
// scoped to isShopBorrowed rows only, computed fresh from the ledger
// rather than any stored balance (this bucket never touches
// currentBalance — see the section comment above).
export async function listShopBorrowedLoans() {
  const shopId = await getCurrentShopId();

  const accounts = await db.customerAccount.findMany({
    where: {
      customer: { shopId },
      transactions: { some: { isShopBorrowed: true } },
    },
    include: {
      customer: true,
      transactions: { where: { isShopBorrowed: true }, orderBy: { transactionDate: "asc" } },
    },
  });

  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const GRACE_PERIOD_DAYS = 7;

  const rows = accounts
    .map((account) => {
      const txns = account.transactions;
      const totalBorrowed = txns.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0);
      const totalPaid = txns.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0);
      const balance = totalBorrowed - totalPaid;

      const earliestTxn = txns[0] ?? null;
      const borrowedSince = earliestTxn?.transactionDate ?? account.openedDate;
      const daysSince = Math.max(0, Math.floor((now - borrowedSince.getTime()) / MS_PER_DAY));

      const oldestDueDated = txns.find((t) => t.dueDate !== null) ?? null;
      const isOverdue =
        oldestDueDated !== null && oldestDueDated.dueDate!.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY < now;

      return {
        customerAccountId: account.id,
        customerId: account.customerId,
        customerName: account.customer.name,
        customerPhone: account.customer.phone,
        balance,
        totalBorrowed,
        totalPaid,
        borrowedSince,
        daysSince,
        dueDate: oldestDueDated?.dueDate ?? null,
        isOverdue,
      };
    })
    .filter((row) => row.balance > 0.01);

  rows.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.borrowedSince.getTime() - b.borrowedSince.getTime();
  });

  return rows;
}

// Stat-card totals for the Udhaar (Shop) → Borrowed from Customers
// tab.
export async function getShopBorrowedSummary() {
  const rows = await listShopBorrowedLoans();

  const totalBorrowed = rows.reduce((sum, r) => sum + r.totalBorrowed, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.totalPaid, 0);
  const totalOwed = rows.reduce((sum, r) => sum + r.balance, 0);
  const overdueCount = rows.filter((r) => r.isOverdue).length;

  return { totalBorrowed, totalPaid, totalOwed, overdueCount, count: rows.length };
}

// One customer's full Shop Borrowed history — every loan given and
// repayment made, in date order — powers the customer detail page's
// "Udhaar to Shop" tab (see CustomerDetailPage). Unlike
// listShopBorrowedLoans (one row per customer, current balance only),
// this is transaction-level detail, same granularity
// PurchaseHistoryList shows for sales. Always returns a shape (never
// null) even when the customer has no Shop Borrowed activity — the
// tab renders its own empty state, same "always show the tab" pattern
// Stock Udhaar's own customer-detail tab already follows, so a
// customer with no such history yet doesn't need a separate
// conditional to hide the tab.
export async function getCustomerShopBorrowedHistory(customerId: string) {
  const shopId = await getCurrentShopId();

  const account = await db.customerAccount.findFirst({
    where: {
      customerId,
      customer: { shopId },
      transactions: { some: { isShopBorrowed: true } },
    },
    include: {
      transactions: { where: { isShopBorrowed: true }, orderBy: { transactionDate: "desc" } },
    },
  });

  const transactions = account?.transactions ?? [];
  const totalBorrowed = transactions
    .filter((t) => t.direction === "OUT")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalPaid = transactions.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    customerAccountId: account?.id ?? null,
    balance: totalBorrowed - totalPaid,
    totalBorrowed,
    totalPaid,
    transactions: transactions.map((t) => ({
      id: t.id,
      direction: t.direction,
      amount: Number(t.amount),
      paymentMethod: t.paymentMethod,
      transactionDate: t.transactionDate,
      dueDate: t.dueDate,
      notes: t.notes,
    })),
  };
}

// Pays a customer back for money the shop borrowed from them — amount
// is capped at that account's own isShopBorrowed balance, never
// trusted from the client. Posts directly, same reasoning as
// createShopBorrowedLoan (this bucket's IN means "shop repays," the
// opposite of recordAccountTransaction's convention, and never
// touches currentBalance).
export async function payShopBorrowedLoan(input: PayShopBorrowedLoanInput) {
  const shopId = await getCurrentShopId();
  const data = payShopBorrowedLoanSchema.parse(input);

  const account = await db.customerAccount.findFirst({
    where: { id: data.customerAccountId, customer: { shopId } },
    include: { transactions: { where: { isShopBorrowed: true } } },
  });
  if (!account) throw new Error("Account not found");

  const totalBorrowed = account.transactions
    .filter((t) => t.direction === "OUT")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalPaid = account.transactions
    .filter((t) => t.direction === "IN")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const balance = totalBorrowed - totalPaid;

  if (data.amount > balance + 0.01) {
    throw new Error(
      `This payment (Rs ${data.amount}) is more than what's actually owed (Rs ${balance}) — a payment can't exceed what's owed.`
    );
  }

  await db.accountTransaction.create({
    data: {
      customerAccountId: account.id,
      direction: "IN",
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      notes: data.notes || "Paid customer back for shop-borrowed money",
      isShopBorrowed: true,
    },
  });
}
