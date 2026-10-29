import { z } from "zod";

// Cash in hand from the register; null = back to not entered.
export const cashInHandRegisterSchema = z.object({
  amount: z.number().nonnegative("Cash in hand can't be negative").nullable(),
});
export type CashInHandRegisterInput = z.infer<typeof cashInHandRegisterSchema>;
