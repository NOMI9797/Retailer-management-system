"use server";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { parseLocalDateStart, toLocalDateString } from "@/lib/utils";
import { coverStockUdhaarFromBatch, undoCoverOntoBatch } from "./grainFifo";
import { postToPooledGrainStock } from "./actions";
import {
  grainPickupSchema,
  updateGrainPickupSchema,
  homeGrainImportSchema,
  updateHomeGrainImportSchema,
  type GrainPickupInput,
  type UpdateGrainPickupInput,
  type HomeGrainImportInput,
  type UpdateHomeGrainImportInput,
} from "./schema";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// A refused pickup write — thrown inside the transaction so it rolls
// back, then shown to the shopkeeper as is.
class Refused extends Error {}

export type HomeGrainRow = {
  id: string;
  date: Date;
  customer: { id: string; name: string };
  product: { id: string; name: string };
  unitName: string;
  reference: string | null;
  quantity: number;
  rate: number;
  amount: number;
  paymentMethod: "CASH" | "ACCOUNT" | "CREDIT" | null;
  // The purchase's payment row — what Edit / Delete purchase act on.
  accountTransactionId: string | null;
  pickedUp: number;
  // Delivered to a buyer straight from the customer's home.
  soldFromHome: number;
  // Still lying at the customer's home.
  remaining: number;
  pickups: { id: string; date: Date; quantity: number; reference: string; notes: string | null }[];
  // Who it was delivered to straight from the home.
  soldTo: { name: string; href: string; quantity: number; date: Date }[];
};

// Grain the shop bought that was (or still is) at the seller's home —
// for one grain, one customer, or all — newest first, with each trip
// picked up so far and what's still there.
export async function listHomeGrain(filter: { productId?: string; customerId?: string } = {}): Promise<HomeGrainRow[]> {
  const shopId = await getCurrentShopId();
  const batches = await db.grainBatch.findMany({
    where: {
      homeCustomerId: filter.customerId ?? { not: null },
      productId: filter.productId,
      product: { shopId },
    },
    include: {
      product: { include: { unit: true } },
      homeCustomer: true,
      pickups: { orderBy: { pickupDate: "asc" } },
      saleAllocations: {
        where: { fromHome: true },
        include: { dailySaleItem: { include: { dailySale: { include: { customer: true, dealer: true } } } } },
      },
      paymentTransactions: { orderBy: { transactionDate: "asc" }, take: 1 },
    },
    orderBy: { receivedAt: "desc" },
  });

  return batches.map((b) => {
    const pickedUp = round3(b.pickups.reduce((s, p) => s + Number(p.quantity), 0));
    const remaining = Number(b.quantityAtHome);
    const txn = b.paymentTransactions[0];
    return {
      id: b.id,
      date: b.receivedAt,
      customer: { id: b.homeCustomer!.id, name: b.homeCustomer!.name },
      product: { id: b.product.id, name: b.product.name },
      unitName: b.product.unit.name,
      reference: b.reference,
      quantity: Number(b.quantityIn),
      rate: Number(b.rate ?? 0),
      amount: txn ? Number(txn.amount) : round3(Number(b.quantityIn) * Number(b.rate ?? 0)),
      paymentMethod: txn ? (txn.paymentMethod as HomeGrainRow["paymentMethod"]) : null,
      accountTransactionId: txn?.id ?? null,
      pickedUp,
      soldFromHome: round3(Number(b.quantityIn) - remaining - pickedUp),
      remaining,
      pickups: b.pickups.map((p) => ({
        id: p.id,
        date: p.pickupDate,
        quantity: Number(p.quantity),
        reference: p.reference,
        notes: p.notes,
      })),
      soldTo: b.saleAllocations
        .filter((a) => Number(a.quantity) > 0)
        .map((a) => {
          const sale = a.dailySaleItem.dailySale;
          return {
            name: sale.customer?.name ?? sale.dealer?.name ?? "Unknown",
            href: sale.customerId ? `/dashboard/customers/${sale.customerId}` : `/dashboard/dealers/${sale.dealerId}`,
            quantity: Number(a.quantity),
            date: a.dailySaleItem.visitAt,
          };
        })
        .sort((x, y) => x.date.getTime() - y.date.getTime()),
    };
  });
}

async function findHomeBatch(tx: Prisma.TransactionClient, shopId: string, grainBatchId: string) {
  const batch = await tx.grainBatch.findFirst({
    where: { id: grainBatchId, product: { shopId } },
    include: { product: { include: { unit: true } } },
  });
  if (!batch || !batch.homeCustomerId) throw new Refused("Purchase not found.");
  return batch;
}

// Moves `change` (+ picked up, − put back at the home) between the
// customer's home and the shelf. Grain picked up may already have
// refilled what the shop owes depositors (Stock Udhaar), so that's
// undone first and done again after — and grain already sold off the
// shelf can't go back to the home.
async function movePickedUp(tx: Prisma.TransactionClient, grainBatchId: string, change: number) {
  await undoCoverOntoBatch(tx, grainBatchId);
  const batch = await tx.grainBatch.update({
    where: { id: grainBatchId },
    data: { quantityAtHome: { decrement: change } },
    include: { product: { include: { unit: true } } },
  });
  const unit = batch.product.unit.name;
  if (Number(batch.quantityAtHome) < -0.0001) {
    throw new Refused(`Only ${round3(Number(batch.quantityAtHome) + change)} ${unit} is still at the customer's home.`);
  }
  const onShelf =
    Number(batch.quantityIn) - Number(batch.quantitySold) - Number(batch.quantityReturned) - Number(batch.quantityAtHome);
  if (onShelf < -0.0001) {
    throw new Refused(
      `${round3(-onShelf)} ${unit} of the grain picked up has already been sold — it can't be put back at the customer's home.`
    );
  }
  await coverStockUdhaarFromBatch(tx, batch.productId, grainBatchId, { tag: true });
}

async function inTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await db.$transaction(fn));
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    throw err;
  }
}

// One trip: `quantity` of the bought grain comes from the customer's
// home onto the shop's shelf. No money moves — it was paid for when
// bought.
export async function createGrainPickup(input: GrainPickupInput): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const parsed = grainPickupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the pickup details");
  const data = parsed.data;

  return inTransaction(async (tx) => {
    await findHomeBatch(tx, shopId, data.grainBatchId);
    const pickup = await tx.grainPickup.create({
      data: {
        shopId,
        grainBatchId: data.grainBatchId,
        quantity: data.quantity,
        pickupDate: parseLocalDateStart(data.pickupDate ?? toLocalDateString(new Date())),
        reference: data.reference,
        notes: data.notes?.trim() || null,
      },
    });
    await movePickedUp(tx, data.grainBatchId, data.quantity);
    return { id: pickup.id };
  });
}

// Editing a trip: quantity (more or less picked up), date, reference,
// notes.
export async function updateGrainPickup(input: UpdateGrainPickupInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = updateGrainPickupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the pickup details");
  const data = parsed.data;

  return inTransaction(async (tx) => {
    const pickup = await tx.grainPickup.findFirst({ where: { id: data.id, shopId } });
    if (!pickup) throw new Refused("Pickup not found.");
    await tx.grainPickup.update({
      where: { id: pickup.id },
      data: {
        quantity: data.quantity,
        pickupDate: data.pickupDate ? parseLocalDateStart(data.pickupDate) : pickup.pickupDate,
        reference: data.reference,
        notes: data.notes?.trim() || null,
      },
    });
    const change = round3(data.quantity - Number(pickup.quantity));
    if (Math.abs(change) > 0.0001) await movePickedUp(tx, pickup.grainBatchId, change);
    return null;
  });
}

// Deleting a trip puts that grain back at the customer's home.
export async function deleteGrainPickup(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  return inTransaction(async (tx) => {
    const pickup = await tx.grainPickup.findFirst({ where: { id, shopId } });
    if (!pickup) throw new Refused("Pickup not found.");
    await tx.grainPickup.delete({ where: { id: pickup.id } });
    await movePickedUp(tx, pickup.grainBatchId, -Number(pickup.quantity));
    return null;
  });
}

// Grain of the shop's lying at a customer's home, recorded as a
// quantity only (see HOME_GRAIN_RATES_ENABLED): it counts in Own stock
// and Advance stock, Rs 0 in Stock value, and no money moves.
export async function createHomeGrainImport(input: HomeGrainImportInput): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const parsed = homeGrainImportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const data = parsed.data;

  return inTransaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: data.productId, shopId, stockKind: "GRAIN" } });
    if (!product) throw new Refused("Grain not found.");
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, shopId } });
    if (!customer) throw new Refused("Customer not found.");
    const batch = await tx.grainBatch.create({
      data: {
        productId: data.productId,
        ownerCustomerId: null,
        quantityIn: data.quantity,
        rate: 0,
        reference: data.reference,
        homeCustomerId: data.customerId,
        quantityAtHome: data.quantity,
      },
    });
    await postToPooledGrainStock(tx, data.productId, data.quantity, 0);
    return { id: batch.id };
  });
}

// Editing a quantity-only entry: its quantity (not below what's
// already left the home — picked up or sold from there) and reference.
export async function updateHomeGrainImport(input: UpdateHomeGrainImportInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = updateHomeGrainImportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const data = parsed.data;

  return inTransaction(async (tx) => {
    const batch = await findHomeBatch(tx, shopId, data.id);
    if ((await tx.accountTransaction.count({ where: { linkedGrainBatchId: batch.id } })) > 0) {
      throw new Refused("This one was bought at a rate — edit the purchase instead.");
    }
    const leftHome = round3(Number(batch.quantityIn) - Number(batch.quantityAtHome));
    if (data.quantity + 0.0001 < leftHome) {
      throw new Refused(`${leftHome} ${batch.product.unit.name} has already left their home — the quantity can't be less than that.`);
    }
    const change = round3(data.quantity - Number(batch.quantityIn));
    await tx.grainBatch.update({
      where: { id: batch.id },
      data: { quantityIn: data.quantity, quantityAtHome: { increment: change }, reference: data.reference },
    });
    if (change !== 0) await postToPooledGrainStock(tx, batch.productId, change, 0);
    return null;
  });
}

// Deleting a quantity-only entry — only while all of it is still at the
// home (delete its pickups / sales first).
export async function deleteHomeGrainImport(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  return inTransaction(async (tx) => {
    const batch = await findHomeBatch(tx, shopId, id);
    if ((await tx.accountTransaction.count({ where: { linkedGrainBatchId: batch.id } })) > 0) {
      throw new Refused("This one was bought at a rate — delete the purchase instead.");
    }
    if (Number(batch.quantityAtHome) + 0.0001 < Number(batch.quantityIn) || Number(batch.quantitySold) > 0.0001) {
      throw new Refused("Some of this grain has already been picked up or sold — delete those first.");
    }
    await postToPooledGrainStock(tx, batch.productId, -Number(batch.quantityIn), 0);
    await tx.grainBatch.delete({ where: { id: batch.id } });
    return null;
  });
}

