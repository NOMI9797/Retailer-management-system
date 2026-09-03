"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "./lib/serialize";
import { grainBatchSchema, type GrainBatchInput } from "./schema";

const DEFAULT_PAGE_SIZE = 50;

export async function createGrainBatch(input: GrainBatchInput) {
  const shopId = await getCurrentShopId();
  const data = grainBatchSchema.parse(input);

  // Confirm the product belongs to this shop before attaching a batch
  // to it — same cross-tenant guard as every other write here.
  const product = await db.product.findFirst({
    where: { id: data.productId, shopId },
  });
  if (!product) throw new Error("Product not found");

  if (data.ownerCustomerId) {
    const customer = await db.customer.findFirst({
      where: { id: data.ownerCustomerId, shopId },
    });
    if (!customer) throw new Error("Customer not found");
  }

  const batch = await db.grainBatch.create({
    data: {
      productId: data.productId,
      ownerCustomerId: data.ownerCustomerId,
      quantityIn: data.quantityIn,
      rate: data.rate,
    },
  });
  return serializeDecimals(batch);
}

function summarizeBatches(batches: { quantityIn: Prisma.Decimal; quantitySold: Prisma.Decimal }[]) {
  const totalIn = batches.reduce((sum, b) => sum + Number(b.quantityIn), 0);
  const totalSold = batches.reduce((sum, b) => sum + Number(b.quantitySold), 0);

  return {
    batchCount: batches.length,
    totalIn,
    totalSold,
    totalRemaining: totalIn - totalSold,
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
