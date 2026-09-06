import { z } from "zod";

// A line item is just product/quantity/price — no payment method
// here. Payment is split on the WHOLE SALE's total afterward (see
// paymentSplitSchema), not per item.
export const dailySaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  actualPrice: z.number().positive("Price must be positive"),
});
export type DailySaleItemInput = z.infer<typeof dailySaleItemSchema>;

// The bill total split across payment methods — cash and account are
// both "paid in full right now" (just different channels, tracked
// separately for Cash Flow reconciliation), credit is the only one
// that creates an outstanding balance. All three are optional
// individually (a sale might be 100% cash, or split any way), but
// together they must sum to exactly the computed item total —
// enforced in createDailySale/updateDailySale, not here, since this
// schema doesn't have the item total to check against.
export const paymentSplitSchema = z.object({
  cash: z.number().nonnegative().default(0),
  account: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
});
export type PaymentSplitInput = z.infer<typeof paymentSplitSchema>;

export const createDailySaleSchema = z.object({
  customerId: z.string().uuid(),
  accountTypeId: z.string().uuid().optional(),
  season: z.string().optional(),
  items: z.array(dailySaleItemSchema).min(1, "At least one item is required"),
  payments: paymentSplitSchema,
});
export type CreateDailySaleInput = z.infer<typeof createDailySaleSchema>;

// Editing a past sale keeps the same customer but replaces the item
// list and payment split entirely — see updateDailySale's
// reverse-then-reapply approach, which is why this doesn't need a
// customerId (that stays fixed; only items/payments can change per
// this milestone's scope).
export const updateDailySaleSchema = z.object({
  saleId: z.string().uuid(),
  accountTypeId: z.string().uuid().optional(),
  items: z.array(dailySaleItemSchema).min(1, "At least one item is required"),
  payments: paymentSplitSchema,
});
export type UpdateDailySaleInput = z.infer<typeof updateDailySaleSchema>;
