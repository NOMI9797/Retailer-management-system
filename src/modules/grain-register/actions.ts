"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { parseLocalDateNow } from "@/lib/utils";
import {
  REGISTER_CARDS,
  grainRegisterFigureSchema,
  advanceRegisterSchema,
  updateAdvanceRegisterSchema,
  type RegisterCard,
  type AdvanceSection,
  type GrainRegisterFigureInput,
  type AdvanceRegisterInput,
  type UpdateAdvanceRegisterInput,
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

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// One customer's advance stock from the register, added up per grain id
// (both sections) — what the Advance stock card shows.
export async function getAdvanceRegister(customerId: string): Promise<Record<string, number>> {
  const shopId = await getCurrentShopId();
  const rows = await db.grainAdvanceRegister.findMany({ where: { shopId, customerId } });
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.productId] = round3((totals[r.productId] ?? 0) + Number(r.kg));
  return totals;
}

// Every customer's Advance stock entries for one grain, added up per
// section — the Grain page's Advance stock card counts them in its
// system figure.
export async function getAdvanceRegisterTotal(productId: string): Promise<Record<AdvanceSection, number>> {
  const shopId = await getCurrentShopId();
  const rows = await db.grainAdvanceRegister.groupBy({
    by: ["section"],
    where: { shopId, productId },
    _sum: { kg: true },
  });
  const kg = (section: AdvanceSection) => round3(Number(rows.find((r) => r.section === section)?._sum.kg ?? 0));
  return { LOAN: kg("LOAN"), HOME: kg("HOME") };
}

export type AdvanceRegisterRow = {
  id: string;
  section: AdvanceSection;
  productId: string;
  productName: string;
  unitName: string;
  kg: number;
  date: Date;
  note: string | null;
};

// One customer's register entries in one section (one tab), newest first.
export async function listAdvanceRegister({
  customerId,
  section,
  productId,
}: {
  customerId: string;
  section: AdvanceSection;
  productId?: string;
}): Promise<AdvanceRegisterRow[]> {
  const shopId = await getCurrentShopId();
  const rows = await db.grainAdvanceRegister.findMany({
    where: { shopId, customerId, section, ...(productId ? { productId } : {}) },
    include: { product: { include: { unit: true } } },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    section: r.section,
    productId: r.productId,
    productName: r.product.name,
    unitName: r.product.unit.name,
    kg: Number(r.kg),
    date: r.entryDate,
    note: r.note,
  }));
}

async function shopGrainIds(shopId: string, ids: string[]) {
  const grains = await db.product.findMany({
    where: { shopId, stockKind: "GRAIN", id: { in: ids } },
    select: { id: true },
  });
  return new Set(grains.map((g) => g.id));
}

// Adds register entries for one customer, one per grain, all in the
// picked section. Display only — nothing else changes.
export async function createAdvanceRegister(input: AdvanceRegisterInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = advanceRegisterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the figures");
  const { customerId, section, entryDate, note, entries } = parsed.data;
  const customer = await db.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) return fail("Customer not found");
  const valid = await shopGrainIds(shopId, entries.map((e) => e.productId));
  if (entries.some((e) => !valid.has(e.productId))) return fail("Grain not found");
  const date = parseLocalDateNow(entryDate);
  await db.grainAdvanceRegister.createMany({
    data: entries.map((e) => ({
      shopId,
      customerId,
      productId: e.productId,
      section,
      kg: e.kg,
      entryDate: date,
      note: note?.trim() || null,
    })),
  });
  return ok(null);
}

export async function updateAdvanceRegister(input: UpdateAdvanceRegisterInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = updateAdvanceRegisterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the figures");
  const data = parsed.data;
  const row = await db.grainAdvanceRegister.findFirst({ where: { id: data.id, shopId } });
  if (!row) return fail("Entry not found");
  const valid = await shopGrainIds(shopId, [data.productId]);
  if (!valid.has(data.productId)) return fail("Grain not found");
  await db.grainAdvanceRegister.update({
    where: { id: row.id },
    data: {
      section: data.section,
      productId: data.productId,
      kg: data.kg,
      entryDate: parseLocalDateNow(data.entryDate),
      note: data.note?.trim() || null,
    },
  });
  return ok(null);
}

export async function deleteAdvanceRegister(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const result = await db.grainAdvanceRegister.deleteMany({ where: { id, shopId } });
  if (result.count === 0) return fail("Entry not found");
  return ok(null);
}
