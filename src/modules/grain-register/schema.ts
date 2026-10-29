import { z } from "zod";

// The Grain page cards that can take a figure from the register — one
// column each on GrainRegisterStock.
export const REGISTER_CARDS = [
  "ownKg",
  "ownValue",
  "customerKg",
  "physicalKg",
  "stockUdhaarKg",
  "stockUdhaarValue",
  "pooledKg",
  "advanceKg",
  "borrowedKg",
] as const;
export type RegisterCard = (typeof REGISTER_CARDS)[number];

// One card's figure from the register; value null = back to the system figure.
export const grainRegisterFigureSchema = z.object({
  productId: z.string().uuid(),
  card: z.enum(REGISTER_CARDS),
  value: z.number().nonnegative("The figure can't be negative").nullable(),
});
export type GrainRegisterFigureInput = z.infer<typeof grainRegisterFigureSchema>;

// Advance stock entries from the register for one customer, all in one
// section (Grain loans / Bought — at their home): one per grain with a
// quantity.
export const ADVANCE_SECTIONS = ["LOAN", "HOME"] as const;
export type AdvanceSection = (typeof ADVANCE_SECTIONS)[number];

export const advanceRegisterSchema = z.object({
  customerId: z.string().uuid(),
  section: z.enum(ADVANCE_SECTIONS),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  note: z.string().optional(),
  entries: z
    .array(z.object({ productId: z.string().uuid(), kg: z.number().positive("Quantity must be more than 0") }))
    .min(1, "Enter a quantity for at least one grain"),
});
export type AdvanceRegisterInput = z.infer<typeof advanceRegisterSchema>;

// Editing one entry — its section and grain can change too.
export const updateAdvanceRegisterSchema = z.object({
  id: z.string().uuid(),
  section: z.enum(ADVANCE_SECTIONS),
  productId: z.string().uuid(),
  kg: z.number().positive("Quantity must be more than 0"),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  note: z.string().optional(),
});
export type UpdateAdvanceRegisterInput = z.infer<typeof updateAdvanceRegisterSchema>;
