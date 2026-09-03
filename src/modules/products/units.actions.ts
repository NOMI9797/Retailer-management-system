"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "./cache";
import { unitSchema, updateUnitSchema, type UnitInput, type UpdateUnitInput } from "./schema";

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
export async function listUnits(includeInactive = false) {
  const shopId = await getCurrentShopId();

  return cachedShopQuery(ENTITY, shopId, [includeInactive], () =>
    db.unit.findMany({
      where: { shopId, isActive: includeInactive ? undefined : true },
      orderBy: { name: "asc" },
    })
  );
}

export async function updateUnit(input: UpdateUnitInput) {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateUnitSchema.parse(input);

  const existing = await db.unit.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Unit not found");

  const unit = await db.unit.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return unit;
}
