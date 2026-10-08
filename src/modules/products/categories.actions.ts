"use server";

import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "@/lib/cache";
import { categorySchema, updateCategorySchema, type CategoryInput, type UpdateCategoryInput } from "./schema";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

const ENTITY = "categories";

export async function createCategory(input: CategoryInput) {
  const shopId = await getCurrentShopId();
  const data = categorySchema.parse(input);

  const category = await db.category.create({
    data: { shopId, name: data.name, stockKind: data.stockKind },
  });
  invalidateShopCache(ENTITY, shopId);
  return category;
}

// Categories change rarely (a shopkeeper edits the list occasionally,
// not on every page view) compared to products/batches, which change
// on every sale — so this is the one list worth caching per shop.
// Cached 60s and invalidated immediately on any write, so edits still
// show up right away.
//
// Wrapped in React's cache() as a safety net: unstable_cache (inside
// cachedShopQuery) caches across requests but doesn't dedupe
// concurrent calls within a single render, so two components calling
// listCategories() in the same request would still both hit it.
// cache() memoizes by arguments for the lifetime of one request, so
// this stays a single fetch even if a future component ends up
// calling it again instead of receiving it as a prop.
export const listCategories = cache(async (includeInactive = false, stockKind?: "SIMPLE" | "GRAIN") => {
  const shopId = await getCurrentShopId();

  return cachedShopQuery(ENTITY, shopId, [includeInactive, stockKind ?? "ALL"], () =>
    db.category.findMany({
      // isDeleted is never shown regardless of includeInactive — a
      // soft-deleted category is gone for good, not just toggled off
      // (see deleteCategory's comment), so it never resurfaces even
      // in the Settings list's "show inactive too" view.
      where: { shopId, isActive: includeInactive ? undefined : true, isDeleted: false, stockKind },
      orderBy: { name: "asc" },
    })
  );
});

export async function updateCategory(
  input: UpdateCategoryInput
): Promise<ActionResult<Awaited<ReturnType<typeof db.category.update>>>> {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateCategorySchema.parse(input);

  // findFirst scoped by shopId before the write, so a category id from
  // another shop can never be updated through this action.
  const existing = await db.category.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Category not found");

  const category = await db.category.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return ok(category);
}

// Soft-deletes a category — Product.categoryId is a required foreign
// key, so a real DELETE would either violate it or orphan every
// product filed under this category; there is no safe hard-delete
// here even once nothing new is being added to it. Requires the
// category be deactivated FIRST (same two-step rule every Settings
// entity now follows), then flips isDeleted instead of removing the
// row — permanently hidden from the Settings list and every picker
// from this point on, with no "undelete" path in the UI, while every
// historical product filed under it keeps resolving its real name
// unchanged.
export async function deleteCategory(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();

  const existing = await db.category.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Category not found");
  if (existing.isActive) {
    return fail("Deactivate this category first, then delete it.");
  }

  await db.category.update({ where: { id }, data: { isDeleted: true } });
  invalidateShopCache(ENTITY, shopId);
  return ok(null);
}
