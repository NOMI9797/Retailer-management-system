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
import { ok, fail, type ActionResult } from "@/lib/actionResult";

const DEFAULT_PAGE_SIZE = 50;

export async function createProduct(
  input: ProductInput
): Promise<ActionResult<ReturnType<typeof serializeDecimals>>> {
  const shopId = await getCurrentShopId();
  const data = productSchema.parse(input);

  // A SIMPLE product must file under a SIMPLE category — never
  // trusted purely from the form's own filtering (see
  // Category.stockKind's schema comment on why the two must always
  // agree; a mismatch here previously let grain products silently
  // leak into Product categories and vice versa).
  const category = await db.category.findFirst({ where: { id: data.categoryId, shopId } });
  if (!category) return fail("Category not found");
  if (category.stockKind !== "SIMPLE") {
    return fail(`"${category.name}" is a Grain category — pick a Product category for this item.`);
  }

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
  return ok(serializeDecimals(product));
}

export async function updateProduct(
  input: UpdateProductInput
): Promise<ActionResult<ReturnType<typeof serializeDecimals>>> {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateProductSchema.parse(input);

  const existing = await db.product.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Product not found");

  // Same category/stockKind agreement createProduct/createGrainProduct
  // enforce — a re-category must still match this product's own kind.
  if (data.categoryId) {
    const category = await db.category.findFirst({ where: { id: data.categoryId, shopId } });
    if (!category) return fail("Category not found");
    if (category.stockKind !== existing.stockKind) {
      return fail(
        `"${category.name}" is a ${category.stockKind === "GRAIN" ? "Grain" : "Product"} category — it doesn't match this item's stock type.`
      );
    }
  }

  const product = await db.product.update({ where: { id }, data });
  return ok(serializeDecimals(product));
}

// Soft-deletes a product (Simple or Grain) — DailySaleItem.productId,
// DealerProductPurchase.productId, GrainBatch.productId, and
// StockUdhaarEntry.productId are all required foreign keys, so a real
// DELETE would either violate one of them or orphan historical sales/
// purchases/batches; there is no safe hard-delete here even once
// nothing new is being sold/bought against it. Requires the product
// be deactivated FIRST (same two-step rule every Settings/catalog
// entity now follows), then flips isDeleted instead of removing the
// row — permanently hidden from every list/picker from this point on
// (no undelete path in the UI), while every historical sale/purchase/
// batch keeps resolving its real name unchanged.
export async function deleteProduct(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();

  const existing = await db.product.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Product not found");
  if (existing.isActive) {
    return fail("Deactivate this product first, then delete it.");
  }

  await db.product.update({ where: { id }, data: { isDeleted: true } });
  return ok(null);
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
  // Settings-style convention (see listCategories/listUnits) — the
  // default view hides an inactive product from pickers/forms, while
  // a management view (the Products/Grain page itself) passes true to
  // still show it with its Inactive badge. isDeleted is NEVER shown
  // regardless of this flag — see Product.isDeleted's schema comment.
  includeInactive?: boolean;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = {
    shopId,
    categoryId: options?.categoryId || undefined,
    stockKind: options?.stockKind,
    name: options?.search ? { contains: options.search, mode: "insensitive" as const } : undefined,
    isActive: options?.includeInactive ? undefined : true,
    isDeleted: false,
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

// The Products page's stat row — shop-wide totals, unaffected by
// whatever the active tab/filters are currently narrowed to.
export async function getProductStats() {
  const shopId = await getCurrentShopId();

  const [simpleCount, grainCount, categoryCount, simpleProducts] = await Promise.all([
    db.product.count({ where: { shopId, stockKind: "SIMPLE" } }),
    db.product.count({ where: { shopId, stockKind: "GRAIN" } }),
    db.category.count({ where: { shopId } }),
    // Stock value = quantity × cost price, summed across simple-stock
    // products only (grain isn't priced per-product — each batch
    // carries its own rate — so it's out of scope for this figure per
    // the "just for simple stock, for now" decision). Valued at cost,
    // not sell price: this is what the shopkeeper has tied up in
    // inventory, not potential revenue.
    db.product.findMany({
      where: { shopId, stockKind: "SIMPLE" },
      select: { quantity: true, costPrice: true },
    }),
  ]);

  const stockValue = simpleProducts.reduce(
    (sum, p) => sum + Number(p.quantity) * Number(p.costPrice ?? 0),
    0
  );

  return { simpleCount, grainCount, categoryCount, stockValue };
}

export async function createGrainProduct(
  input: GrainProductInput
): Promise<ActionResult<ReturnType<typeof serializeDecimals>>> {
  const shopId = await getCurrentShopId();
  const data = grainProductSchema.parse(input);

  // Mirror of createProduct's own check — a GRAIN product must file
  // under a GRAIN category.
  const category = await db.category.findFirst({ where: { id: data.categoryId, shopId } });
  if (!category) return fail("Category not found");
  if (category.stockKind !== "GRAIN") {
    return fail(`"${category.name}" is a Product category — pick a Grain category for this item.`);
  }

  const product = await db.product.create({
    data: {
      shopId,
      categoryId: data.categoryId,
      unitId: data.unitId,
      name: data.name,
      stockKind: "GRAIN",
    },
  });
  return ok(serializeDecimals(product));
}
