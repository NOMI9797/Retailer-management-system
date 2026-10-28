import { z } from "zod";

// Ownership-transfer/purchase: the shopkeeper buys N units of a
// customer's already-deposited stock at an agreed rate (Stock
// Management spec, section 4) — a batch that was stored earlier and
// is only now being settled. N must not exceed that batch's remaining
// ownership claim (quantityIn - quantityTransferred — NOT quantityIn
// - quantitySold, since a sale-without-settlement never reduces the
// claim; see GrainBatch.quantityTransferred's schema comment).
// Enforced in the action, not here, since it needs a database read to
// check against.
//
// bankAccountId is required whenever paymentMethod is ACCOUNT — money
// moving through "Account" must always say WHICH bank account (see
// BankAccount's schema comment) — and ignored/irrelevant otherwise;
// the .refine() below is the one place this rule is enforced so every
// payment-method schema in the app applies it identically.
//
// A plain store-for-later deposit (spec section 2) reuses the
// existing grainBatchSchema/createGrainBatch — no new schema needed
// there.
export const transferPurchaseSchema = z
  .object({
    grainBatchId: z.string().uuid(),
    quantity: z.number().positive("Quantity must be positive"),
    rate: z.number().positive("Rate must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    // Slip / register reference, required on every payment.
    reference: z.string().trim().min(1, "Enter a reference"),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type TransferPurchaseInput = z.infer<typeof transferPurchaseSchema>;

// The "selling right at drop-off" shortcut — a customer depositing
// grain who wants to sell it to the shop immediately, rather than
// storing it for later. No grainBatchId (unlike transferPurchaseSchema
// above): none exists yet at this point, since the deposit and the
// purchase are the same single action here.
export const depositWithSettlementSchema = z
  .object({
    productId: z.string().uuid(),
    customerId: z.string().uuid(),
    quantity: z.number().positive("Quantity must be positive"),
    rate: z.number().positive("Rate must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    // Slip / register reference, required on every payment.
    reference: z.string().trim().min(1, "Enter a reference"),
    notes: z.string().optional(),
    // Bought, but the grain is still at the customer's home — the shop
    // picks it up later (GrainPickup), in trips.
    atHome: z.boolean().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type DepositWithSettlementInput = z.infer<typeof depositWithSettlementSchema>;

// Editing an already-recorded grain settlement (a "Buy from customer"
// transfer-purchase or a settle-now deposit) — identified by its own
// AccountTransaction id (see updateGrainSettlement), not a batch id,
// since the new shop-owned batch and its payment transaction are
// recreated from scratch under the hood rather than patched in place
// (see that function's comment for why: quantity/rate changes ripple
// into pooled stock, Stock Udhaar settlement, and the source batch's
// claim, so "undo fully, then redo with the new numbers" is the only
// way to keep all of those consistent).
export const updateGrainSettlementSchema = z
  .object({
    accountTransactionId: z.string().uuid(),
    // The customer's whole deposit this was bought from (transfer-
    // purchases only; ignored for a settle-now deposit, where the
    // deposit IS the purchase). Optional — omitted leaves it as is.
    depositQuantity: z.number().positive("Deposited quantity must be positive").optional(),
    quantity: z.number().positive("Quantity must be positive"),
    rate: z.number().positive("Rate must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    // Slip / register reference, required on every payment.
    reference: z.string().trim().min(1, "Enter a reference"),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type UpdateGrainSettlementInput = z.infer<typeof updateGrainSettlementSchema>;

// Giving a customer back grain they deposited but never settled a
// rate for — as it is, no money either way. Up to their unsettled
// quantity on that deposit.
export const depositReturnSchema = z.object({
  grainBatchId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  // "YYYY-MM-DD" — defaults to today.
  returnDate: z.string().optional(),
  reference: z.string().trim().min(1, "Enter a reference"),
  notes: z.string().optional(),
});
export type DepositReturnInput = z.infer<typeof depositReturnSchema>;

// Editing a give-back: its quantity, date, reference and notes.
export const updateDepositReturnSchema = depositReturnSchema.omit({ grainBatchId: true }).extend({
  id: z.string().uuid(),
});
export type UpdateDepositReturnInput = z.infer<typeof updateDepositReturnSchema>;

// One trip picking up grain the shop bought that was still at the
// customer's home — up to what's still there.
export const grainPickupSchema = z.object({
  grainBatchId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  // "YYYY-MM-DD" — defaults to today.
  pickupDate: z.string().optional(),
  reference: z.string().trim().min(1, "Enter a reference"),
  notes: z.string().optional(),
});
export type GrainPickupInput = z.infer<typeof grainPickupSchema>;

export const updateGrainPickupSchema = grainPickupSchema.omit({ grainBatchId: true }).extend({
  id: z.string().uuid(),
});
export type UpdateGrainPickupInput = z.infer<typeof updateGrainPickupSchema>;

// Grain at a customer's home recorded as a quantity only (no rate, no
// payment — see HOME_GRAIN_RATES_ENABLED).
export const homeGrainImportSchema = z.object({
  productId: z.string().uuid(),
  customerId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  reference: z.string().trim().min(1, "Enter a reference"),
  notes: z.string().optional(),
});
export type HomeGrainImportInput = z.infer<typeof homeGrainImportSchema>;

export const updateHomeGrainImportSchema = z.object({
  id: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  reference: z.string().trim().min(1, "Enter a reference"),
});
export type UpdateHomeGrainImportInput = z.infer<typeof updateHomeGrainImportSchema>;
