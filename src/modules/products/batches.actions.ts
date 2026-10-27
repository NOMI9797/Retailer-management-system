"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { grainBatchSchema, updateGrainBatchSchema, type GrainBatchInput, type UpdateGrainBatchInput } from "./schema";
import { postToPooledGrainStock } from "@/modules/stock/actions";
import { coverStockUdhaarFromBatch } from "@/modules/stock/grainFifo";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

const DEFAULT_PAGE_SIZE = 50;

export async function createGrainBatch(
  input: GrainBatchInput
): Promise<ActionResult<ReturnType<typeof serializeDecimals>>> {
  const shopId = await getCurrentShopId();
  const data = grainBatchSchema.parse(input);

  // Confirm the product belongs to this shop before attaching a batch
  // to it — same cross-tenant guard as every other write here.
  const product = await db.product.findFirst({
    where: { id: data.productId, shopId },
  });
  if (!product) return fail("Product not found");

  if (data.ownerCustomerId) {
    // A customer-deposited batch just needs a valid, shop-scoped
    // customer — no special account type required. Depositing stock
    // for safekeeping posts no money and needs no ledger account yet;
    // rate is genuinely optional here too — "store for later" means
    // no price is calculated at deposit time at all (see
    // GrainBatch.rate's schema comment). An account only gets
    // involved later, either when the shopkeeper purchases this
    // stock from the customer (stock/actions.ts:
    // createTransferPurchase), or immediately via the "selling now"
    // path (stock/actions.ts: createDepositWithSettlement), which
    // never calls this action at all — it creates a shop-owned batch
    // directly instead.
    const customer = await db.customer.findFirst({
      where: { id: data.ownerCustomerId, shopId },
    });
    if (!customer) return fail("Customer not found");
  } else if (data.rate === undefined) {
    // A shop-owned batch is the shop's actual inventory — it must
    // always have a real cost basis, unlike a customer's
    // store-for-later deposit.
    return fail("Rate is required for a shop-owned batch");
  }

  const batch = await db.$transaction(async (tx) => {
    const batch = await tx.grainBatch.create({
      data: {
        productId: data.productId,
        ownerCustomerId: data.ownerCustomerId,
        quantityIn: data.quantityIn,
        rate: data.rate ?? null,
        reference: data.reference,
      },
    });
    // Only a REAL, priced batch enters the pool — a customer's
    // rate-less "store for later" deposit doesn't touch it at all
    // until it's later priced via a settlement or a sale-time rate
    // override (see postToPooledGrainStock's comment).
    if (data.rate !== undefined) {
      await postToPooledGrainStock(tx, data.productId, data.quantityIn, data.quantityIn * data.rate);
    }
    // New own grain first gives back any Stock Udhaar still owed.
    if (!data.ownerCustomerId) await coverStockUdhaarFromBatch(tx, data.productId, batch.id);
    return batch;
  });
  return ok(serializeDecimals(batch));
}

// Edits a still-unsettled customer deposit's quantity — the Grain
// tab's "unsettled" row (see CustomerGrainSection). Refuses once any
// of it has been priced (rate set — a shop-owned batch, or a customer
// batch a settlement has touched) or physically moved at all
// (quantitySold/quantityTransferred > 0, e.g. a Stock Udhaar sale
// already drew from it) — at that point it's no longer a plain
// unsettled deposit, and the quantity can't be changed without
// unwinding whatever already happened first.
export async function updateGrainBatch(input: UpdateGrainBatchInput): Promise<ActionResult<ReturnType<typeof serializeDecimals>>> {
  const shopId = await getCurrentShopId();
  const data = updateGrainBatchSchema.parse(input);

  const batch = await db.grainBatch.findFirst({ where: { id: data.id, product: { shopId } } });
  if (!batch) return fail("Deposit not found");
  if (!batch.ownerCustomerId) return fail("This is a shop-owned batch — edit it from the Grain stock page instead.");
  if (batch.rate !== null) return fail("This deposit has already been priced — edit the settlement instead.");
  if (Number(batch.quantitySold) > 0 || Number(batch.quantityTransferred) > 0 || Number(batch.quantityReturned) > 0) {
    return fail("Some of this deposit has already been settled, sold or given back — it can't be edited until that's resolved.");
  }

  const updated = await db.grainBatch.update({
    where: { id: data.id },
    data: { quantityIn: data.quantityIn },
  });
  return ok(serializeDecimals(updated));
}

// Deletes a still-unsettled customer deposit outright — same scope
// restriction as updateGrainBatch above (no rate, nothing sold or
// transferred yet). A plain delete is safe here specifically because
// a rate-less deposit posts NOTHING on creation (see createGrainBatch's
// comment) — no pooled stock, no account/bank entry, no Stock Udhaar —
// so there is nothing to reverse, unlike deleteGrainSettlement.
export async function deleteGrainBatch(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();

  const batch = await db.grainBatch.findFirst({ where: { id, product: { shopId } } });
  if (!batch) return fail("Deposit not found");
  if (!batch.ownerCustomerId) return fail("This is a shop-owned batch — delete it from the Grain stock page instead.");
  if (batch.rate !== null) return fail("This deposit has already been priced — delete the settlement instead.");
  if (Number(batch.quantitySold) > 0 || Number(batch.quantityTransferred) > 0 || Number(batch.quantityReturned) > 0) {
    return fail("Some of this deposit has already been settled, sold or given back — it can't be deleted until that's resolved.");
  }

  // Stock Udhaar history left by sales that were since reversed (each
  // growth entry cancelled by its compensating one) still points at
  // this batch; nothing is owed, so it goes with the deposit.
  const entries = await db.stockUdhaarEntry.findMany({ where: { grainBatchId: id } });
  const net = entries.reduce((sum, e) => sum + Number(e.quantity), 0);
  if (Math.abs(net) > 0.0001) {
    return fail("This deposit still has Stock Udhaar outstanding — it can't be deleted until that's settled.");
  }

  await db.$transaction([
    db.stockUdhaarEntry.deleteMany({ where: { grainBatchId: id } }),
    db.grainBatch.delete({ where: { id } }),
  ]);
  return ok(null);
}

function summarizeBatches(
  batches: {
    quantityIn: Prisma.Decimal;
    quantitySold: Prisma.Decimal;
    quantityTransferred: Prisma.Decimal;
    quantityReturned: Prisma.Decimal;
  }[]
) {
  const totalIn = batches.reduce((sum, b) => sum + Number(b.quantityIn), 0);
  const totalSold = batches.reduce((sum, b) => sum + Number(b.quantitySold), 0);
  // A customer batch's transferred-out portion is still physically on
  // the shelf, but it's also counted on the NEW shop-owned batch a
  // transfer-purchase creates (see stock/actions.ts:
  // createTransferPurchase) — subtracted here too, or it double-counts
  // across both batch rows. Always 0 for shop-owned batches.
  const totalTransferred = batches.reduce((sum, b) => sum + Number(b.quantityTransferred), 0);
  // Given back to the customer unsettled — left the shop.
  const totalReturned = batches.reduce((sum, b) => sum + Number(b.quantityReturned), 0);

  return {
    batchCount: batches.length,
    totalIn,
    totalSold,
    totalRemaining: totalIn - totalSold - totalTransferred - totalReturned,
  };
}

export async function listGrainBatches(productId: string) {
  const shopId = await getCurrentShopId();

  const product = await db.product.findFirst({
    where: { id: productId, shopId },
  });
  if (!product) throw new Error("Product not found");

  const batches = await db.grainBatch.findMany({
    where: { productId },
    include: { ownerCustomer: true },
    orderBy: { receivedAt: "asc" },
  });
  return batches.map(serializeDecimals);
}

export async function getGrainStockSummary(productId: string) {
  const shopId = await getCurrentShopId();

  const product = await db.product.findFirst({
    where: { id: productId, shopId },
  });
  if (!product) throw new Error("Product not found");

  const batches = await db.grainBatch.findMany({ where: { productId } });
  return summarizeBatches(batches);
}

// Combines listGrainBatches + getGrainStockSummary into one round
// trip — both derive from the same batch rows, so there's no reason
// to query twice. Used by the UI; the two above stay available
// individually per the milestone's action list.
export async function getGrainProductDetail(productId: string) {
  const shopId = await getCurrentShopId();

  const product = await db.product.findFirst({
    where: { id: productId, shopId },
  });
  if (!product) throw new Error("Product not found");

  const batches = await db.grainBatch.findMany({
    where: { productId },
    include: { ownerCustomer: true },
    orderBy: { receivedAt: "asc" },
  });

  return {
    batches: batches.map(serializeDecimals),
    summary: summarizeBatches(batches),
  };
}

function groupAndSerializeBatches(
  batches: Prisma.GrainBatchGetPayload<{ include: { ownerCustomer: true } }>[]
) {
  const byProduct: Record<string, typeof batches> = {};
  for (const batch of batches) {
    (byProduct[batch.productId] ??= []).push(batch);
  }

  const result: Record<
    string,
    { batches: ReturnType<typeof serializeDecimals<(typeof batches)[number]>>[]; summary: ReturnType<typeof summarizeBatches> }
  > = {};
  for (const [id, productBatches] of Object.entries(byProduct)) {
    result[id] = {
      batches: productBatches.map(serializeDecimals),
      summary: summarizeBatches(productBatches),
    };
  }
  return result;
}

// One round trip for every grain product's batches + summary at
// once — used on the Grain stock tab so N products don't mean N
// separate fetches on mount.
export async function listGrainProductDetails(productIds: string[]) {
  const shopId = await getCurrentShopId();

  if (productIds.length === 0) return {};

  const products = await db.product.findMany({
    where: { id: { in: productIds }, shopId },
    select: { id: true },
  });
  const validIds = new Set(products.map((p) => p.id));

  const batches = await db.grainBatch.findMany({
    where: { productId: { in: [...validIds] } },
    include: { ownerCustomer: true },
    orderBy: { receivedAt: "asc" },
  });

  const grouped = groupAndSerializeBatches(batches);
  // Every id gets an entry even with zero batches, so callers don't
  // need an extra `?? empty` fallback per product.
  for (const id of validIds) {
    grouped[id] ??= { batches: [], summary: summarizeBatches([]) };
  }
  return grouped;
}

// Paginated grain-product listing for the shop: fetches one page of
// GRAIN products, then batches for only that page — so a shop with
// hundreds of grain products doesn't load every batch on every visit
// to the Grain stock tab.
export async function listGrainProductDetailsForShop(options?: { page?: number; pageSize?: number }) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = { shopId, stockKind: "GRAIN" as const, isDeleted: false };

  const [products, totalCount] = await Promise.all([
    db.product.findMany({
      where,
      include: { category: true, unit: true },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);

  const batches = await db.grainBatch.findMany({
    where: { productId: { in: products.map((p) => p.id) } },
    include: { ownerCustomer: true },
    orderBy: { receivedAt: "asc" },
  });

  const grouped = groupAndSerializeBatches(batches);
  for (const p of products) {
    grouped[p.id] ??= { batches: [], summary: summarizeBatches([]) };
  }

  return {
    products: products.map(serializeDecimals),
    details: grouped,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}
