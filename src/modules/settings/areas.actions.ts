"use server";

import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "@/lib/cache";
import { areaSchema, updateAreaSchema, type AreaInput, type UpdateAreaInput } from "./schema";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

const ENTITY = "areas";

// TODO: flat list only. Area has a parentAreaId in the schema for a
// city -> sub-area hierarchy, but that's not exposed by this action
// or the UI built on it — a deliberate, smaller scope for now, not
// an oversight. Revisit if/when a hierarchical area picker is needed.
export async function createArea(input: AreaInput) {
  const shopId = await getCurrentShopId();
  const data = areaSchema.parse(input);

  const area = await db.area.create({
    data: { shopId, name: data.name },
  });
  invalidateShopCache(ENTITY, shopId);
  return area;
}

// Areas change rarely — cached per shop like categories/units.
export const listAreas = cache(async (includeInactive = false) => {
  const shopId = await getCurrentShopId();

  return cachedShopQuery(ENTITY, shopId, [includeInactive], () =>
    db.area.findMany({
      where: { shopId, isActive: includeInactive ? undefined : true },
      orderBy: { name: "asc" },
    })
  );
});

export async function updateArea(input: UpdateAreaInput): Promise<ActionResult<{ id: string; name: string }>> {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateAreaSchema.parse(input);

  const existing = await db.area.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Area not found");

  const area = await db.area.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return ok(area);
}

// Permanently removes an area — a real DELETE, since Customer.areaId
// is nullable (unlike Product.categoryId/unitId). Requires the area
// to be deactivated FIRST (same two-step rule every Settings entity
// now follows — Deactivate alone leaves it visible/reactivatable in
// the list; Delete is the permanent, no-undo step), and is still
// blocked whenever any customer is currently assigned to it, since
// deleting it out from under them would silently clear their area.
// The shopkeeper must reassign those customers to a different area
// first.
export async function deleteArea(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();

  const existing = await db.area.findFirst({ where: { id, shopId }, include: { customers: true } });
  if (!existing) return fail("Area not found");
  if (existing.isActive) {
    return fail("Deactivate this area first, then delete it.");
  }
  if (existing.customers.length > 0) {
    return fail(`This area has ${existing.customers.length} customer(s) assigned to it — reassign them before deleting.`);
  }

  await db.area.delete({ where: { id } });
  invalidateShopCache(ENTITY, shopId);
  return ok(null);
}
