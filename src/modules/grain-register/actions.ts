"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import {
  REGISTER_CARDS,
  grainRegisterFigureSchema,
  grainAdvanceRegisterSchema,
  type RegisterCard,
  type GrainRegisterFigureInput,
  type GrainAdvanceRegisterInput,
} from "./schema";

// The register figure on each Grain page card; a card left out shows
// what the records add up to.
export type GrainRegisterStock = Partial<Record<RegisterCard, number>>;

export async function getGrainRegisterStock(productId: string): Promise<GrainRegisterStock> {
  const shopId = await getCurrentShopId();
  const row = await db.grainRegisterStock.findUnique({ where: { shopId_productId: { shopId, productId } } });
  const figures: GrainRegisterStock = {};
  if (!row) return figures;
  for (const card of REGISTER_CARDS) {
    if (row[card] !== null) figures[card] = Number(row[card]);
  }
  return figures;
}

// Saves (or clears, with null) one card's register figure — display
// only, nothing else in the system moves.
export async function setGrainRegisterFigure(input: GrainRegisterFigureInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = grainRegisterFigureSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the figure");
  const { productId, card, value } = parsed.data;
  const product = await db.product.findFirst({ where: { id: productId, shopId, stockKind: "GRAIN" } });
  if (!product) return fail("Grain not found");
  await db.grainRegisterStock.upsert({
    where: { shopId_productId: { shopId, productId } },
    create: { shopId, productId, [card]: value },
    update: { [card]: value },
  });
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

