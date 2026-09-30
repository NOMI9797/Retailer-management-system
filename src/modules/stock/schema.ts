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
// A plain store-for-later deposit (spec section 2) reuses the
// existing grainBatchSchema/createGrainBatch — no new schema needed
// there.
export const transferPurchaseSchema = z.object({
  grainBatchId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  rate: z.number().positive("Rate must be positive"),
  paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
  notes: z.string().optional(),
});
export type TransferPurchaseInput = z.infer<typeof transferPurchaseSchema>;

// The "selling right at drop-off" shortcut — a customer depositing
// grain who wants to sell it to the shop immediately, rather than
// storing it for later. No grainBatchId (unlike transferPurchaseSchema
// above): none exists yet at this point, since the deposit and the
// purchase are the same single action here.
export const depositWithSettlementSchema = z.object({
  productId: z.string().uuid(),
  customerId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  rate: z.number().positive("Rate must be positive"),
  paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
  notes: z.string().optional(),
});
export type DepositWithSettlementInput = z.infer<typeof depositWithSettlementSchema>;

// Paying down money the shop owes a customer for grain it bought on
// Credit (see getShopOwedForGrain) — the opposite direction from
// recordAccountTransaction's debt convention (that one is for a
// customer's debt to the shop, not the shop's debt to a customer), so
// this needs its own action rather than reusing that one. amount is
// capped at that PRODUCT's own outstanding grain debt in the action,
// not trusted from the client — per the "pay per product, from that
// product's own row" decision, a payment is always scoped to one
// product (a customer owing on both Cotton and Wheat needs two
// separate payments, never one combined lump sum), so
// getShopOwedForGrain's per-product figure stays exact.
export const payGrainDebtSchema = z.object({
  customerId: z.string().uuid(),
  productId: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["CASH", "ACCOUNT"]),
  notes: z.string().optional(),
});
export type PayGrainDebtInput = z.infer<typeof payGrainDebtSchema>;
