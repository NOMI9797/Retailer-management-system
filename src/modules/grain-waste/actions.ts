"use server";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { parseLocalDateNow, toLocalDateString } from "@/lib/utils";
import { getStockOverview, postToPooledGrainStock } from "@/modules/stock/actions";
import { getOpeningState } from "@/modules/grain-opening/fills";
import { grainWasteSchema, updateGrainWasteSchema, type GrainWasteInput, type UpdateGrainWasteInput } from "./schema";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// A refused write — thrown inside the transaction so it rolls back.
class Refused extends Error {}

type Tx = Prisma.TransactionClient;

// The shop's own grain on its shelf right now, batch by batch: what
// each still has (not sold, not given back, not still at a customer's
// home) and what it cost.
async function shelfBatches(tx: Tx, productId: string) {
  const batches = await tx.grainBatch.findMany({
    where: { productId, ownerCustomerId: null, removedFromGrain: false, fromRegister: false },
    orderBy: { receivedAt: "asc" },
  });
  return batches
    .map((b) => ({
      id: b.id,
      available: round3(
        Number(b.quantityIn) - Number(b.quantitySold) - Number(b.quantityReturned) - Number(b.quantityAtHome)
      ),
      rate: Number(b.rate ?? 0),
    }))
    .filter((b) => b.available > 0.0005);
}

// The rate a kg of customers' grain lost to waste is owed back at: the
// grain's break-even rate while it has Stock Udhaar, else what its own
// grain costs now, else the last rate paid for it. Null = no price yet.
async function customerGrainRate(tx: Tx, productId: string, ownKg: number, ownValue: number) {
  const opening = await getOpeningState(tx, productId);
  if (opening && opening.totalKg > 0.0005) return opening.breakEven;
  if (ownKg > 0.0005) return ownValue / ownKg;
  const last = await tx.grainBatch.findFirst({
    where: { productId, ownerCustomerId: null, grainLoanId: null, grainLoanReturnId: null, grainWasteId: null, rate: { gt: 0 } },
    orderBy: { receivedAt: "desc" },
    select: { rate: true },
  });
  return last?.rate != null ? Number(last.rate) : null;
}

// Customers' grain on the shelf right now (what waste can take once the
// shop's own runs out).
async function customerShelfKg(productId: string, ownShelfKg: number) {
  const o = await getStockOverview(productId);
  return round3(Math.max(o.totalPhysical - ownShelfKg, 0));
}

// What the waste form shows before saving: the shop's own grain on the
// shelf, what it cost, and so the cost per kg — and the customers'
// grain on the shelf that waste beyond it would come out of, with the
// rate it would be owed back at.
export async function getShelfStock(productId: string) {
  const shopId = await getCurrentShopId();
  const product = await db.product.findFirst({
    where: { id: productId, shopId, stockKind: "GRAIN" },
    include: { unit: true },
  });
  if (!product) throw new Error("Grain not found");
  const batches = await shelfBatches(db as unknown as Tx, productId);
  const kg = round3(batches.reduce((s, b) => s + b.available, 0));
  const value = round2(batches.reduce((s, b) => s + b.available * b.rate, 0));
  // Customers' grain can only be wasted once the grain runs on its
  // records (not while register figures are still on its cards).
  const register = await db.grainRegisterStock.findUnique({ where: { shopId_productId: { shopId, productId } } });
  const customerRate = register ? null : await customerGrainRate(db as unknown as Tx, productId, kg, value);
  return {
    productName: product.name,
    unitName: product.unit.name,
    kg,
    value,
    rate: kg > 0 ? round6(value / kg) : 0,
    customerKg: register || customerRate === null ? 0 : await customerShelfKg(productId, kg),
    customerRate: customerRate !== null ? round6(customerRate) : null,
  };
}

// Wastes `quantity` of the grain on the shelf — the shop's own first:
// every own shelf batch is used up (its history — what was sold from
// it, at its own rate — stays), and what's left after the waste comes
// back as one batch carrying ALL that cost, so the cost per kg goes up
// and Stock value doesn't change. If nothing is left, that cost is
// simply gone (a loss right away). Waste beyond the shop's own comes
// out of customers' grain (up to `customerLimit` kg): the shop owes it
// back — more Stock Udhaar, valued at the grain's break-even rate, so
// profit drops by that much until it's bought back below that rate.
async function applyWaste(tx: Tx, shopId: string, data: GrainWasteInput, unit: string, customerLimit: number) {
  const batches = await shelfBatches(tx, data.productId);
  const kgBefore = round3(batches.reduce((s, b) => s + b.available, 0));
  const valueBefore = round2(batches.reduce((s, b) => s + b.available * b.rate, 0));
  const ownPart = round3(Math.min(data.quantity, kgBefore));
  const customerPart = round3(data.quantity - ownPart);
  let customerRate: number | null = null;
  if (customerPart > 0.0005) {
    if (customerPart > customerLimit + 0.0005) {
      throw new Refused(
        `The shelf holds only ${round3(kgBefore + customerLimit)} ${unit} (${kgBefore} the shop's own, ${customerLimit} customers') — that's the most that can be wasted.`
      );
    }
    const register = await tx.grainRegisterStock.findUnique({ where: { shopId_productId: { shopId, productId: data.productId } } });
    if (register) {
      throw new Refused(`The shop has only ${kgBefore} ${unit} of its own — finalize this grain from the register before wasting customers' grain.`);
    }
    customerRate = await customerGrainRate(tx, data.productId, kgBefore, valueBefore);
    if (customerRate === null) throw new Refused("This grain has no rate yet to value the customers' grain at.");
    // A grain with no opening yet gets an empty one to carry what's owed.
    const opening = await tx.grainOpening.findFirst({ where: { shopId, productId: data.productId } });
    if (!opening) {
      await tx.grainOpening.create({
        data: { shopId, productId: data.productId, udhaarKg: 0, udhaarValue: 0, leftShopKg: 0, register: {} },
      });
    }
  }
  const wasteDate = parseLocalDateNow(data.wasteDate ?? toLocalDateString(new Date()));

  const waste = await tx.grainWaste.create({
    data: {
      shopId,
      productId: data.productId,
      quantity: data.quantity,
      wasteDate,
      reference: data.reference,
      notes: data.notes?.trim() || null,
      kgBefore,
      valueBefore,
      fromCustomersKg: customerPart > 0.0005 ? customerPart : 0,
      customerRate,
    },
  });
  if (ownPart <= 0.0005) return waste;
  for (const b of batches) {
    await tx.grainBatch.update({ where: { id: b.id }, data: { quantitySold: { increment: b.available } } });
    await tx.grainWasteDraw.create({ data: { grainWasteId: waste.id, grainBatchId: b.id, quantity: b.available } });
  }
  const left = round3(kgBefore - ownPart);
  if (left > 0.0005) {
    await tx.grainBatch.create({
      data: {
        productId: data.productId,
        ownerCustomerId: null,
        quantityIn: left,
        rate: round6(valueBefore / left),
        receivedAt: wasteDate,
        reference: data.reference,
        grainWasteId: waste.id,
      },
    });
  }
  // The pool loses the shop's own kg, not the cost.
  await postToPooledGrainStock(tx, data.productId, -ownPart, 0);
  return waste;
}

// Puts a waste back exactly as it was — only while the grain it left
// behind hasn't been touched since (sold, lent, wasted again…).
async function undoWaste(tx: Tx, shopId: string, id: string) {
  const waste = await tx.grainWaste.findFirst({ where: { id, shopId }, include: { draws: true, remainder: true } });
  if (!waste) throw new Refused("Waste record not found.");
  const r = waste.remainder;
  if (r && (Number(r.quantitySold) > 0.0005 || Number(r.quantityReturned) > 0.0005 || Number(r.quantityAtHome) > 0.0005)) {
    throw new Refused(
      "Some of the grain left after this waste has been sold, lent or wasted since — undo that first, then this can be changed."
    );
  }
  // Its customers' grain part is owed no more — unless new stock has
  // already bought it back.
  const customerPart = Number(waste.fromCustomersKg);
  if (customerPart > 0.0005) {
    const opening = await getOpeningState(tx, waste.productId);
    if (opening && opening.remainingKg + 0.0005 < customerPart) {
      throw new Refused(
        "The customers' grain this waste took has already been bought back with new stock — undo that purchase first, then this can be changed."
      );
    }
  }
  if (r) await tx.grainBatch.delete({ where: { id: r.id } });
  for (const d of waste.draws) {
    await tx.grainBatch.update({ where: { id: d.grainBatchId }, data: { quantitySold: { decrement: d.quantity } } });
  }
  await tx.grainWasteDraw.deleteMany({ where: { grainWasteId: waste.id } });
  await tx.grainWaste.delete({ where: { id: waste.id } });
  await postToPooledGrainStock(tx, waste.productId, round3(Number(waste.quantity) - customerPart), 0);
  return waste;
}

async function inTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await db.$transaction(fn));
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    throw err;
  }
}

export async function createGrainWaste(input: GrainWasteInput): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const parsed = grainWasteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const data = parsed.data;
  const ownShelf = round3((await shelfBatches(db as unknown as Tx, data.productId)).reduce((s, b) => s + b.available, 0));
  const limit = await customerShelfKg(data.productId, ownShelf);
  return inTransaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: data.productId, shopId, stockKind: "GRAIN" },
      include: { unit: true },
    });
    if (!product) throw new Refused("Grain not found.");
    const waste = await applyWaste(tx, shopId, data, product.unit.name, limit);
    return { id: waste.id };
  });
}

// Editing = undo, then waste again with the new figures.
export async function updateGrainWaste(input: UpdateGrainWasteInput): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const parsed = updateGrainWasteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const data = parsed.data;
  const existing = await db.grainWaste.findFirst({ where: { id: data.id, shopId } });
  if (!existing) return fail("Waste record not found.");
  // Undoing it first puts its kg back on the shelf: what was taken from
  // customers is customers' grain again.
  const ownShelf = round3((await shelfBatches(db as unknown as Tx, existing.productId)).reduce((s, b) => s + b.available, 0));
  const limit = round3((await customerShelfKg(existing.productId, ownShelf)) + Number(existing.fromCustomersKg));
  return inTransaction(async (tx) => {
    const old = await undoWaste(tx, shopId, data.id);
    const product = await tx.product.findUniqueOrThrow({ where: { id: old.productId }, include: { unit: true } });
    const waste = await applyWaste(tx, shopId, { ...data, productId: old.productId }, product.unit.name, limit);
    return { id: waste.id };
  });
}

export async function deleteGrainWaste(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  return inTransaction(async (tx) => {
    await undoWaste(tx, shopId, id);
    return null;
  });
}

export type GrainWasteRow = {
  id: string;
  date: Date;
  quantity: number;
  reference: string;
  notes: string | null;
  kgBefore: number;
  valueBefore: number;
  rateBefore: number;
  kgAfter: number;
  rateAfter: number | null;
  // Taken from customers' grain (beyond the shop's own), owed back at customerRate.
  fromCustomersKg: number;
  customerRate: number | null;
  // The grain left behind has been sold / used since — can't be undone.
  locked: boolean;
};

export async function listGrainWaste(productId: string): Promise<GrainWasteRow[]> {
  const shopId = await getCurrentShopId();
  const rows = await db.grainWaste.findMany({
    where: { shopId, productId },
    include: { remainder: true },
    orderBy: { wasteDate: "desc" },
  });
  return rows.map((w) => {
    const kgBefore = Number(w.kgBefore);
    const valueBefore = Number(w.valueBefore);
    const r = w.remainder;
    return {
      id: w.id,
      date: w.wasteDate,
      quantity: Number(w.quantity),
      reference: w.reference,
      notes: w.notes,
      kgBefore,
      valueBefore,
      rateBefore: kgBefore > 0 ? round2(valueBefore / kgBefore) : 0,
      kgAfter: round3(kgBefore - (Number(w.quantity) - Number(w.fromCustomersKg))),
      fromCustomersKg: Number(w.fromCustomersKg),
      customerRate: w.customerRate != null ? Number(w.customerRate) : null,
      rateAfter: r?.rate != null ? round2(Number(r.rate)) : null,
      locked: !!r && (Number(r.quantitySold) > 0.0005 || Number(r.quantityReturned) > 0.0005 || Number(r.quantityAtHome) > 0.0005),
    };
  });
}
