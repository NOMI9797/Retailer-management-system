import { z } from "zod";

// A grain's own stock (kg) and stock value (Rs) from the register.
export const grainRegisterStockSchema = z.object({
  productId: z.string().uuid(),
  ownKg: z.number().nonnegative("Own stock can't be negative"),
  ownValue: z.number().nonnegative("Stock value can't be negative"),
  note: z.string().optional(),
});
export type GrainRegisterStockInput = z.infer<typeof grainRegisterStockSchema>;

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
