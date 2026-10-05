"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { grainBatchSchema, type GrainBatchInput } from "./schema";
import { postToPooledGrainStock } from "@/modules/stock/actions";
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
      },
    });
    // Only a REAL, priced batch enters the pool — a customer's
    // rate-less "store for later" deposit doesn't touch it at all
    // until it's later priced via a settlement or a sale-time rate
    // override (see postToPooledGrainStock's comment).
    if (data.rate !== undefined) {
      await postToPooledGrainStock(tx, data.productId, data.quantityIn, data.quantityIn * data.rate);
    }
    return batch;
  });
  return ok(serializeDecimals(batch));
}

function summarizeBatches(
  batches: { quantityIn: Prisma.Decimal; quantitySold: Prisma.Decimal; quantityTransferred: Prisma.Decimal }[]
) {
  const totalIn = batches.reduce((sum, b) => sum + Number(b.quantityIn), 0);
  const totalSold = batches.reduce((sum, b) => sum + Number(b.quantitySold), 0);
  // A customer batch's transferred-out portion is still physically on
  // the shelf, but it's also counted on the NEW shop-owned batch a
  // transfer-purchase creates (see stock/actions.ts:
  // createTransferPurchase) — subtracted here too, or it double-counts
  // across both batch rows. Always 0 for shop-owned batches.
  const totalTransferred = batches.reduce((sum, b) => sum + Number(b.quantityTransferred), 0);

  return {
    batchCount: batches.length,
    totalIn,
    totalSold,
    totalRemaining: totalIn - totalSold - totalTransferred,
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

  const where = { shopId, stockKind: "GRAIN" as const };

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
