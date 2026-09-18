"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, toLocalDateString } from "@/lib/utils";
import {
  customerSchema,
  updateCustomerSchema,
  recordAccountTransactionSchema,
  createLongTermLoanSchema,
  type CustomerInput,
  type UpdateCustomerInput,
  type RecordAccountTransactionInput,
  type CreateLongTermLoanInput,
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
// before for any OTHER account type a caller explicitly passes (e.g.
// Consignment when registering a farmer) — nothing about that
// capability was removed, only the New Sale/Add Customer forms no
// longer show a picker for it.
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
// a regular walk-in buyer who's now also become a farmer supplying
// consigned grain needs a second, Consignment-style account without
// losing their existing Regular one. No-ops if they already hold that
// account type (picking it again from the UI shouldn't create a
// second row of the same type).
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
// share. NOT for consignment/farmer accounts: those only ever get
// AccountTransactions posted automatically from applySaleItems, whose
// OUT-decrements-balance convention has the opposite meaning (money
// leaving the shop TO the farmer) from a customer loan (money the
// shop is now owed MORE of). Rejecting tracksQuantity accounts here
// keeps that existing convention completely untouched rather than
// trying to make one direction mean two different things.
export async function recordAccountTransaction(input: RecordAccountTransactionInput) {
  const shopId = await getCurrentShopId();
  const data = recordAccountTransactionSchema.parse(input);

  const account = await db.customerAccount.findFirst({
    where: { id: data.customerAccountId, customer: { shopId } },
    include: { accountType: true, transactions: true },
  });
  if (!account) throw new Error("Account not found");
  if (account.accountType.tracksQuantity) {
    throw new Error("Consignment accounts are posted automatically from sales, not recorded manually here.");
  }

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

    // Mirror image of the consignment convention (see the comment
    // above): on a debt account, OUT (loan given) means the customer
    // now owes MORE, so balance increments; IN (repayment) means they
    // owe LESS, so balance decrements. describeBalance's "positive =
    // customer owes shop" convention stays correct either way.
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
// exactly one implementation of the balance math and the
// account/tracksQuantity guard, not a second one duplicated here.
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
