"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { customerSchema, updateCustomerSchema, type CustomerInput, type UpdateCustomerInput } from "./schema";

const DEFAULT_PAGE_SIZE = 50;

export async function createCustomer(input: CustomerInput) {
  const shopId = await getCurrentShopId();
  const data = customerSchema.parse(input);

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

export async function updateCustomer(input: UpdateCustomerInput) {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateCustomerSchema.parse(input);

  const existing = await db.customer.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Customer not found");

  return db.customer.update({ where: { id }, data });
}

// What Daily Sales calls when a new customer is typed in rather than
// picked from the list — same record either way, no duplication.
export async function findOrCreateCustomerByName(name: string) {
  const shopId = await getCurrentShopId();

  const existing = await db.customer.findFirst({
    where: { shopId, name },
  });
  if (existing) return existing;

  return db.customer.create({ data: { shopId, name } });
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
    customers,
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
