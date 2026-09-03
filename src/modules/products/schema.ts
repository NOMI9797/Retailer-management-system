import { z } from "zod";

// One source of truth for "what does a valid category/unit/product/
// batch look like" — shared by forms, actions, and the types around
// both. Kept together since all four are scoped to this milestone.

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
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
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// Grain product — no costPrice/sellPrice; baseRate is a reference
// rate only, each batch carries its own actual rate.
export const grainProductSchema = z.object({
  categoryId: z.string().uuid(),
  unitId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  baseRate: z.number().positive("Base rate must be positive"),
});
export type GrainProductInput = z.infer<typeof grainProductSchema>;

// Owner is either "shop-owned" (ownerCustomerId omitted/null) or a
// specific customer — the toggle in the UI maps directly to this.
export const grainBatchSchema = z.object({
  productId: z.string().uuid(),
  ownerCustomerId: z.string().uuid().optional(),
  quantityIn: z.number().positive("Quantity received must be positive"),
  rate: z.number().positive("Rate must be positive"),
});
export type GrainBatchInput = z.infer<typeof grainBatchSchema>;
