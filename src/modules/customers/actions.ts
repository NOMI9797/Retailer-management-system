"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { customerSchema, updateCustomerSchema, type CustomerInput, type UpdateCustomerInput } from "./schema";

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
export async function createCustomer(input: CustomerInput) {
  const shopId = await getCurrentShopId();
  const data = customerSchema.parse(input);

  const existing = await db.customer.findFirst({
    where: { shopId, name: { equals: data.name, mode: "insensitive" } },
    include: { accounts: true },
  });

  if (existing) {
    const heldTypeIds = new Set(existing.accounts.map((a) => a.accountTypeId));
    const newTypeIds = data.accountTypeIds.filter((id) => !heldTypeIds.has(id));
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
        create: data.accountTypeIds.map((accountTypeId) => ({
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
// "Udhar") rather than detaching one type and attaching another,
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
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = {
    shopId,
    areaId: options?.areaId || undefined,
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
