import { z } from "zod";

// Grain of the shop's own that went to waste — how much, when, and a
// slip / register reference.
export const grainWasteSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  // "YYYY-MM-DD" — defaults to today.
  wasteDate: z.string().optional(),
  reference: z.string().trim().min(1, "Enter a reference"),
  notes: z.string().optional(),
});
export type GrainWasteInput = z.infer<typeof grainWasteSchema>;

export const updateGrainWasteSchema = grainWasteSchema.omit({ productId: true }).extend({
  id: z.string().uuid(),
});
export type UpdateGrainWasteInput = z.infer<typeof updateGrainWasteSchema>;
