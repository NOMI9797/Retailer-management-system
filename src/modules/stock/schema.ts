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
    notes: z.string().optional(),
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
    quantity: z.number().positive("Quantity must be positive"),
    rate: z.number().positive("Rate must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type UpdateGrainSettlementInput = z.infer<typeof updateGrainSettlementSchema>;
