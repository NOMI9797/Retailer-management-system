"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import {
  grainRegisterStockSchema,
  grainAdvanceRegisterSchema,
  type GrainRegisterStockInput,
  type GrainAdvanceRegisterInput,
} from "./schema";

export type GrainRegisterStock = { ownKg: number; ownValue: number; note: string | null; updatedAt: Date };

// The register's own stock / stock value for one grain, or null when
// none has been entered (the cards then show what the records add up to).
export async function getGrainRegisterStock(productId: string): Promise<GrainRegisterStock | null> {
  const shopId = await getCurrentShopId();
  const row = await db.grainRegisterStock.findUnique({ where: { shopId_productId: { shopId, productId } } });
  if (!row) return null;
  return { ownKg: Number(row.ownKg), ownValue: Number(row.ownValue), note: row.note, updatedAt: row.updatedAt };
}

// Saves (or replaces) the register figures — display only, nothing
// else in the system moves.
export async function setGrainRegisterStock(input: GrainRegisterStockInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = grainRegisterStockSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the figures");
  const data = parsed.data;
  const product = await db.product.findFirst({ where: { id: data.productId, shopId, stockKind: "GRAIN" } });
  if (!product) return fail("Grain not found");
  const fields = { ownKg: data.ownKg, ownValue: data.ownValue, note: data.note?.trim() || null };
  await db.grainRegisterStock.upsert({
    where: { shopId_productId: { shopId, productId: data.productId } },
    create: { shopId, productId: data.productId, ...fields },
    update: fields,
  });
  return ok(null);
}

// Back to showing what the records add up to.
export async function clearGrainRegisterStock(productId: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  await db.grainRegisterStock.deleteMany({ where: { shopId, productId } });
  return ok(null);
}

// One customer's advance stock from the register, per grain id.
export async function getAdvanceRegister(customerId: string): Promise<Record<string, number>> {
  const shopId = await getCurrentShopId();
  const rows = await db.grainAdvanceRegister.findMany({ where: { shopId, customerId } });
  return Object.fromEntries(rows.map((r) => [r.productId, Number(r.kg)]));
}

// Saves a customer's advance stock from the register for every grain in
// one go: a figure is saved (or replaced), a blank one is removed.
// Display only — nothing else changes.
export async function setAdvanceRegister(input: GrainAdvanceRegisterInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = grainAdvanceRegisterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the figures");
  const { customerId, entries } = parsed.data;
  const customer = await db.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) return fail("Customer not found");
  const grains = await db.product.findMany({
    where: { shopId, stockKind: "GRAIN", id: { in: entries.map((e) => e.productId) } },
    select: { id: true },
  });
  const valid = new Set(grains.map((g) => g.id));
  await db.$transaction(
    entries
      .filter((e) => valid.has(e.productId))
      .map((e) =>
        e.kg === null
          ? db.grainAdvanceRegister.deleteMany({ where: { shopId, customerId, productId: e.productId } })
          : db.grainAdvanceRegister.upsert({
              where: { shopId_customerId_productId: { shopId, customerId, productId: e.productId } },
              create: { shopId, customerId, productId: e.productId, kg: e.kg },
              update: { kg: e.kg },
            })
      )
  );
  return ok(null);
}

