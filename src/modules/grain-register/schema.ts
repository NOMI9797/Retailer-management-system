import { z } from "zod";

// The Grain page cards that can take a figure from the register — one
// column each on GrainRegisterStock.
export const REGISTER_CARDS = [
  "ownKg",
  "ownValue",
  "customerKg",
  "physicalKg",
  "stockUdhaarKg",
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

// One customer's advance stock (the shop's grain at their home) from
// the register, every grain at once. kg null = no figure for that grain.
export const grainAdvanceRegisterSchema = z.object({
  customerId: z.string().uuid(),
  entries: z.array(
    z.object({
      productId: z.string().uuid(),
      kg: z.number().nonnegative("Quantity can't be negative").nullable(),
    })
  ),
});
export type GrainAdvanceRegisterInput = z.infer<typeof grainAdvanceRegisterSchema>;
