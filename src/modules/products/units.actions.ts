"use server";

import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "@/lib/cache";
import { unitSchema, updateUnitSchema, type UnitInput, type UpdateUnitInput } from "./schema";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

const ENTITY = "units";

export async function createUnit(input: UnitInput) {
  const shopId = await getCurrentShopId();
  const data = unitSchema.parse(input);

  const unit = await db.unit.create({
    data: { shopId, name: data.name },
  });
  invalidateShopCache(ENTITY, shopId);
  return unit;
}

// Same reasoning as listCategories: units barely change day to day,
// so a short cache avoids a database hit on every navigation.
// Wrapped in React's cache() for the same request-level dedup
// safety net — see the comment on listCategories.
export const listUnits = cache(async (includeInactive = false) => {
  const shopId = await getCurrentShopId();

  return cachedShopQuery(ENTITY, shopId, [includeInactive], () =>
    db.unit.findMany({
      // isDeleted is never shown regardless of includeInactive — see
      // deleteUnit's comment.
      where: { shopId, isActive: includeInactive ? undefined : true, isDeleted: false },
      orderBy: { name: "asc" },
    })
  );
});

export async function updateUnit(
  input: UpdateUnitInput
): Promise<ActionResult<Awaited<ReturnType<typeof db.unit.update>>>> {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateUnitSchema.parse(input);

  const existing = await db.unit.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Unit not found");

  const unit = await db.unit.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return ok(unit);
}

// Soft-deletes a unit — same reasoning as deleteCategory
// (categories.actions.ts): Product.unitId is a required foreign key,
// so there is no safe hard-delete. Requires deactivation first, then
// flips isDeleted instead of removing the row.
export async function deleteUnit(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();

  const existing = await db.unit.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Unit not found");
  if (existing.isActive) {
    return fail("Deactivate this unit first, then delete it.");
  }

  await db.unit.update({ where: { id }, data: { isDeleted: true } });
  invalidateShopCache(ENTITY, shopId);
  return ok(null);
}
