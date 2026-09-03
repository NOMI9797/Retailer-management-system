"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { customerSchema, type CustomerInput } from "./schema";

// Server Actions do the writing (per the "hooks read, actions write"
// rule) — called directly from a form via useFormState/useActionState,
// no separate API route needed.

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

export async function findOrCreateCustomerByName(name: string) {
  const shopId = await getCurrentShopId();

  const existing = await db.customer.findFirst({
    where: { shopId, name },
  });
  if (existing) return existing;

  return db.customer.create({ data: { shopId, name } });
}

export async function listCustomers(query?: string) {
  const shopId = await getCurrentShopId();

  return db.customer.findMany({
    where: {
      shopId,
      name: query ? { contains: query, mode: "insensitive" } : undefined,
    },
    include: { area: true, accounts: { include: { accountType: true } } },
    orderBy: { createdAt: "desc" },
  });
}
