"use server";

import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "@/lib/cache";
import {
  accountTypeSchema,
  updateAccountTypeSchema,
  addAccountTypeFieldSchema,
  updateAccountTypeFieldSchema,
  type AccountTypeInput,
  type UpdateAccountTypeInput,
  type AddAccountTypeFieldInput,
  type UpdateAccountTypeFieldInput,
} from "./schema";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

const ENTITY = "accountTypes";

export async function createAccountType(input: AccountTypeInput) {
  const shopId = await getCurrentShopId();
  const data = accountTypeSchema.parse(input);

  const accountType = await db.accountType.create({
    data: {
      shopId,
      name: data.name,
      code: data.code,
      isLoan: data.isLoan,
      fields: {
        create: data.fields.map((f) => ({
          fieldName: f.fieldName,
          fieldLabel: f.fieldLabel,
          fieldType: f.fieldType,
          isRequired: f.isRequired,
          displayOrder: f.displayOrder,
        })),
      },
    },
  });
  invalidateShopCache(ENTITY, shopId);
  return accountType;
}

// Account types change rarely (set up once, occasionally extended) —
// cached per shop like categories/units. Wrapped in React's cache()
// for request-level dedup on top of the cross-request unstable_cache.
export const listAccountTypes = cache(async (includeInactive = false) => {
  const shopId = await getCurrentShopId();

  return cachedShopQuery(ENTITY, shopId, [includeInactive], () =>
    db.accountType.findMany({
      // isDeleted is never shown regardless of includeInactive — see
      // deleteAccountType's comment.
      where: { shopId, isActive: includeInactive ? undefined : true, isDeleted: false },
      include: { fields: { orderBy: { displayOrder: "asc" } } },
      orderBy: { name: "asc" },
    })
  );
});

// Fetches one account type with its fields — used by the detail view
// (clicking an account type's name). Not cached: it's a single-row
// read, and the detail page needs to reflect field add/edit/delete
// immediately. Left throwing (not converted to ActionResult): this is
// a data-fetch called from a Server Component during render, not a
// form submission — its return type is also reused via
// ReturnType<typeof getAccountType> by AccountTypeFieldList's Field
// type, so wrapping it would ripple into that type derivation too.
export async function getAccountType(id: string) {
  const shopId = await getCurrentShopId();

  const accountType = await db.accountType.findFirst({
    where: { id, shopId },
    include: { fields: { orderBy: { displayOrder: "asc" } } },
  });
  if (!accountType) throw new Error("Account type not found");

  return accountType;
}

export async function updateAccountType(
  input: UpdateAccountTypeInput
): Promise<ActionResult<Awaited<ReturnType<typeof db.accountType.update>>>> {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateAccountTypeSchema.parse(input);

  const existing = await db.accountType.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Account type not found");

  const accountType = await db.accountType.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return ok(accountType);
}

// Soft-deletes an account type — CustomerAccount.accountTypeId is a
// required foreign key, so a real DELETE would either violate it or
// orphan every customer's account history under this type; there is
// no safe hard-delete here even once nothing new is being created
// against it. Requires the type be deactivated FIRST (same two-step
// rule every Settings entity now follows), then flips isDeleted
// instead of removing the row — permanently hidden from the Settings
// list and every picker, while every historical customer account
// under it keeps resolving its real name unchanged.
export async function deleteAccountType(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();

  const existing = await db.accountType.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Account type not found");
  if (existing.isActive) {
    return fail("Deactivate this account type first, then delete it.");
  }

  await db.accountType.update({ where: { id }, data: { isDeleted: true } });
  invalidateShopCache(ENTITY, shopId);
  return ok(null);
}

// Called once per shop the first time any account-type-dependent
// screen loads — ensures a walk-in customer always has something to
// fall back to, per the milestone's "seed one default account type"
// requirement. Idempotent: does nothing if "Regular" already exists.
export async function ensureDefaultAccountType() {
  const shopId = await getCurrentShopId();

  const existing = await db.accountType.findFirst({
    where: { shopId, code: "REGULAR" },
  });
  if (existing) return existing;

  const accountType = await db.accountType.create({
    data: { shopId, name: "Regular", code: "REGULAR" },
  });
  invalidateShopCache(ENTITY, shopId);
  return accountType;
}

// ── Custom fields (account type detail view) ────────────

export async function addAccountTypeField(
  input: AddAccountTypeFieldInput
): Promise<ActionResult<Awaited<ReturnType<typeof db.accountTypeField.create>>>> {
  const shopId = await getCurrentShopId();
  const { accountTypeId, ...data } = addAccountTypeFieldSchema.parse(input);

  const accountType = await db.accountType.findFirst({ where: { id: accountTypeId, shopId } });
  if (!accountType) return fail("Account type not found");

  const field = await db.accountTypeField.create({
    data: { accountTypeId, ...data },
  });
  invalidateShopCache(ENTITY, shopId);
  return ok(field);
}

export async function updateAccountTypeField(
  input: UpdateAccountTypeFieldInput
): Promise<ActionResult<Awaited<ReturnType<typeof db.accountTypeField.update>>>> {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateAccountTypeFieldSchema.parse(input);

  // Scoped through the parent account type's shopId, same
  // cross-tenant guard as every other write in this module.
  const existing = await db.accountTypeField.findFirst({
    where: { id, accountType: { shopId } },
  });
  if (!existing) return fail("Field not found");

  const field = await db.accountTypeField.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return ok(field);
}

// TODO(Customers module): once customers can hold AccountFieldValue
// rows against this field, this must check for and handle those
// before deleting — either block the delete or warn how many
// customers are affected. Hard delete is safe ONLY right now, because
// the Customers module doesn't exist yet and no AccountFieldValue row
// can exist for any field. Revisit this as part of the Customers
// module's definition of done (Milestone 2, build step 3), not later.
export async function deleteAccountTypeField(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();

  const existing = await db.accountTypeField.findFirst({
    where: { id, accountType: { shopId } },
  });
  if (!existing) return fail("Field not found");

  await db.accountTypeField.delete({ where: { id } });
  invalidateShopCache(ENTITY, shopId);
  return ok(null);
}
