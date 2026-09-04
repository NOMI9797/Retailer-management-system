"use server";

import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "@/lib/cache";
import { areaSchema, updateAreaSchema, type AreaInput, type UpdateAreaInput } from "./schema";

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
export const listAreas = cache(async () => {
  const shopId = await getCurrentShopId();

  return cachedShopQuery(ENTITY, shopId, [], () =>
    db.area.findMany({
      where: { shopId },
      orderBy: { name: "asc" },
    })
  );
});

export async function updateArea(input: UpdateAreaInput) {
  const shopId = await getCurrentShopId();
  const { id, name } = updateAreaSchema.parse(input);

  const existing = await db.area.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Area not found");

  const area = await db.area.update({ where: { id }, data: { name } });
  invalidateShopCache(ENTITY, shopId);
  return area;
}
