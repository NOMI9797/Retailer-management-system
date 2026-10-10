import { z } from "zod";

// One source of truth for "what does a valid category/unit/product/
// batch look like" — shared by forms, actions, and the types around
// both. Kept together since all four are scoped to this milestone.

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  // Which kind of product this category is for — see
  // Category.stockKind's schema comment. Required on create (a
  // category is always one or the other from the moment it's added,
  // never ambiguous), never changeable afterward via updateCategorySchema
  // below — recategorizing an entire category's kind after products
  // already reference it is out of scope here.
  stockKind: z.enum(["SIMPLE", "GRAIN"]),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const unitSchema = z.object({
  name: z.string().min(1, "Name is required"),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const updateUnitSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

// Simple stock product. costPrice/sellPrice are required here —
// grain products go through grainProductSchema instead.
export const productSchema = z.object({
  categoryId: z.string().uuid(),
  unitId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  costPrice: z.number().positive("Cost price must be positive"),
  sellPrice: z.number().positive("Sell price must be positive"),
  quantity: z.number().nonnegative("Quantity can't be negative").default(0),
});
export type ProductInput = z.infer<typeof productSchema>;

export const updateProductSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required").optional(),
  costPrice: z.number().positive("Cost price must be positive").optional(),
  sellPrice: z.number().positive("Sell price must be positive").optional(),
  quantity: z.number().nonnegative("Quantity can't be negative").optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// Grain product — no costPrice/sellPrice, no baseRate either: a
// product itself is never priced, only its batches are (each batch
// carries its own real rate, since grain prices move during the
// season) — a product-level "reference rate" was never read anywhere
// for money math, so it's removed entirely rather than kept as dead
// weight on the form.
export const grainProductSchema = z.object({
  categoryId: z.string().uuid(),
  unitId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
});
export type GrainProductInput = z.infer<typeof grainProductSchema>;

// Owner is either "shop-owned" (ownerCustomerId omitted/null) or a
// specific customer — the toggle in the UI maps directly to this.
// rate is optional ONLY for a customer-owned batch — a customer
// dropping off grain for safekeeping has no price yet (see
// GrainBatch.rate's schema comment); a shop-owned batch must always
// carry a real rate, since that's what the shop actually paid for
// stock it now owns. Enforced in createGrainBatch (a Zod-level
// .optional() can't express "required only when ownerCustomerId is
// absent" cleanly without a .superRefine, and the action already does
// its own shop/customer validation there).
export const grainBatchSchema = z.object({
  productId: z.string().uuid(),
  ownerCustomerId: z.string().uuid().optional(),
  quantityIn: z.number().positive("Quantity received must be positive"),
  rate: z.number().positive("Rate must be positive").optional(),
});
export type GrainBatchInput = z.infer<typeof grainBatchSchema>;
