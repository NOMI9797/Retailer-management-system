"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "./cache";
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
export async function listCategories(includeInactive = false) {
  const shopId = await getCurrentShopId();

  return cachedShopQuery(ENTITY, shopId, [includeInactive], () =>
    db.category.findMany({
      where: { shopId, isActive: includeInactive ? undefined : true },
      orderBy: { name: "asc" },
    })
  );
}

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
