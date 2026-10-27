import { z } from "zod";

// Goods brought back from one bill (one visit of a sale): which lines
// and how many of each, in the unit each line was sold in.
export const saleReturnSchema = z.object({
  dailySaleId: z.string().uuid(),
  visitAt: z.coerce.date(),
  items: z
    .array(z.object({ dailySaleItemId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1, "Enter how many of at least one item came back"),
  // "YYYY-MM-DD" — defaults to today.
  returnDate: z.string().optional(),
  reference: z.string().trim().min(1, "Enter a reference"),
  notes: z.string().optional(),
});
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;

// Part of a purchase from a dealer sent back: a products purchase or a
// grain batch bought from the dealer — exactly one.
export const purchaseReturnSchema = z
  .object({
    purchaseId: z.string().uuid().optional(),
    grainBatchId: z.string().uuid().optional(),
    quantity: z.number().positive("Quantity must be positive"),
    // CASH / ACCOUNT = the dealer pays it back; CREDIT = less owed to them.
    refundMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    returnDate: z.string().optional(),
    reference: z.string().trim().min(1, "Enter a reference"),
    notes: z.string().optional(),
  })
  .refine((d) => !!d.purchaseId !== !!d.grainBatchId, { message: "Pick the purchase to return from", path: ["purchaseId"] })
  .refine((d) => d.refundMethod !== "ACCOUNT" || !!d.bankAccountId, {
    message: "Select which bank account the money came into",
    path: ["bankAccountId"],
  });
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;
