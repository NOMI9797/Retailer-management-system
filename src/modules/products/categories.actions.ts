"use server";

import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "@/lib/cache";
import { categorySchema, updateCategorySchema, type CategoryInput, type UpdateCategoryInput } from "./schema";

const ENTITY = "categories";

export async function createCategory(input: CategoryInput) {
  const shopId = await getCurrentShopId();
  const data = categorySchema.parse(input);

  const category = await db.category.create({
    data: { shopId, name: data.name },
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
export const listCategories = cache(async (includeInactive = false) => {
  const shopId = await getCurrentShopId();

  return cachedShopQuery(ENTITY, shopId, [includeInactive], () =>
    db.category.findMany({
      where: { shopId, isActive: includeInactive ? undefined : true },
      orderBy: { name: "asc" },
    })
  );
});

export async function updateCategory(input: UpdateCategoryInput) {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateCategorySchema.parse(input);

  // findFirst scoped by shopId before the write, so a category id from
  // another shop can never be updated through this action.
  const existing = await db.category.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Category not found");

  const category = await db.category.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return category;
}
