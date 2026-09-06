"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import {
  productSchema,
  updateProductSchema,
  grainProductSchema,
  type ProductInput,
  type UpdateProductInput,
  type GrainProductInput,
} from "./schema";

const DEFAULT_PAGE_SIZE = 50;

export async function createProduct(input: ProductInput) {
  const shopId = await getCurrentShopId();
  const data = productSchema.parse(input);

  const product = await db.product.create({
    data: {
      shopId,
      categoryId: data.categoryId,
      unitId: data.unitId,
      name: data.name,
      stockKind: "SIMPLE",
      costPrice: data.costPrice,
      sellPrice: data.sellPrice,
      quantity: data.quantity,
    },
  });
  return serializeDecimals(product);
}

export async function updateProduct(input: UpdateProductInput) {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateProductSchema.parse(input);

  const existing = await db.product.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Product not found");

  const product = await db.product.update({ where: { id }, data });
  return serializeDecimals(product);
}

// Paginated so a shop with a large catalog doesn't pull every row on
// every navigation — page/pageSize follow Prisma's skip/take shape.
// totalCount lets the UI render "Page 2 of 14" without a second
// round trip.
export async function listProducts(options?: {
  categoryId?: string;
  search?: string;
  stockKind?: "SIMPLE" | "GRAIN";
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = {
    shopId,
    categoryId: options?.categoryId || undefined,
    stockKind: options?.stockKind,
    name: options?.search ? { contains: options.search, mode: "insensitive" as const } : undefined,
  };

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

  return {
    products: products.map(serializeDecimals),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export async function createGrainProduct(input: GrainProductInput) {
  const shopId = await getCurrentShopId();
  const data = grainProductSchema.parse(input);

  const product = await db.product.create({
    data: {
      shopId,
      categoryId: data.categoryId,
      unitId: data.unitId,
      name: data.name,
      stockKind: "GRAIN",
      baseRate: data.baseRate,
    },
  });
  return serializeDecimals(product);
}
