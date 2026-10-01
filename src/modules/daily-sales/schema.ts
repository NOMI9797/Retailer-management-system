import { z } from "zod";

// A line item is just product/quantity/price — no payment method
// here. Payment is split on the WHOLE SALE's total afterward (see
// paymentSplitSchema), not per item.
//
// batchRateOverrides only ever matters for GRAIN items, and only when
// FIFO depletion (applySaleItems) draws from a customer batch that
// hasn't been priced yet (rate: null — a "store for later" deposit
// still awaiting settlement). Entirely optional: selling from a
// rate-less batch is always allowed with no rate supplied — the
// shopkeeper usually can't know the cost yet, since it only gets
// agreed when they later settle with the depositor (see
// createTransferPurchase) — so this is purely a shortcut for the rare
// case the caller already happens to know the rate up front. Keyed by
// grainBatchId rather than a single scalar because one sale item
// COULD span more than one rate-less batch in a pathological case.
export const dailySaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be positive"),
  actualPrice: z.number().positive("Price must be positive"),
  batchRateOverrides: z.record(z.string().uuid(), z.number().positive()).optional(),
  // How much of THIS item's own price is being paid via Credit —
  // only ever meaningful for a GRAIN item, and only ever REQUIRED
  // when the sale has more than one grain item and the sale-level
  // credit amount is nonzero (a single-grain-item sale's whole credit
  // amount is unambiguous, so this stays optional there — see
  // applyPaymentSplit's comment on why). Lets per-grain-item Udhaar
  // be tracked as a real, shopkeeper-entered fact (see
  // GrainSaleCreditPayment) instead of a guessed/approximated split
  // of the sale's one combined credit total across its items.
  creditAmount: z.number().nonnegative().optional(),
  // When THIS item's own Credit amount must be paid back by — same
  // "duration picked, due date always derived" shape Long-term
  // Udhaar/Shop-Borrowed loans already use (never a free date
  // picker). "YYYY-MM-DD", computed client-side from a duration and
  // sent as a plain date; only meaningful alongside a nonzero
  // creditAmount, ignored otherwise.
  creditDueDate: z.string().optional(),
});
export type DailySaleItemInput = z.infer<typeof dailySaleItemSchema>;

// The bill total split across payment methods — cash and account are
// both "paid in full right now" (just different channels, tracked
// separately for Cash Flow reconciliation), credit means "not paid
// yet." Cash/Account never post to a CustomerAccount's ledger. Credit
// does: it auto-posts a debt onto the customer's Udhaar account (see
// applyPaymentSplit), auto-creating that account if they don't have
// one yet — the one exception to "account types are purely static
// categorization, untouched by Daily Sales." All three are optional
// individually (a sale might be 100% cash, or split any way), but
// together they must sum to exactly the computed item total —
// enforced in createDailySale/updateDailySale, not here, since this
// schema doesn't have the item total to check against.
export const paymentSplitSchema = z
  .object({
    cash: z.number().nonnegative().default(0),
    account: z.number().nonnegative().default(0),
    credit: z.number().nonnegative().default(0),
    // Which bank account the `account` portion moved through —
    // required whenever account > 0, same "Account must always say
    // which bank account" rule every other payment-method schema in
    // the app applies (see BankAccount's schema comment). There's
    // only ever one bank account per split (unlike cash/account/
    // credit, "account" itself is never further split across more
    // than one bank in a single sale).
    bankAccountId: z.string().uuid().optional(),
  })
  .refine((data) => data.account === 0 || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type PaymentSplitInput = z.infer<typeof paymentSplitSchema>;

export const createDailySaleSchema = z.object({
  customerId: z.string().uuid(),
  season: z.string().optional(),
  items: z.array(dailySaleItemSchema).min(1, "At least one item is required"),
  payments: paymentSplitSchema,
  // "YYYY-MM-DD" — lets a shopkeeper record a sale they forgot to
  // enter on the day it actually happened (e.g. remembered the next
  // morning). Defaults to today when omitted, so every existing caller
  // that doesn't pass this keeps behaving exactly as before. This is
  // what day the sale is merged into (see findTodaysSale) and what
  // Cash Flow's daily aggregation keys off — there's no separate
  // propagation step, everything downstream reads saleDate directly.
  saleDate: z.string().optional(),
});
export type CreateDailySaleInput = z.infer<typeof createDailySaleSchema>;

// Editing a past sale keeps the same customer but replaces the item
// list and payment split entirely — see updateDailySale's
// reverse-then-reapply approach, which is why this doesn't need a
// customerId (that stays fixed; only items/payments can change per
// this milestone's scope).
export const updateDailySaleSchema = z.object({
  saleId: z.string().uuid(),
  items: z.array(dailySaleItemSchema).min(1, "At least one item is required"),
  payments: paymentSplitSchema,
});
export type UpdateDailySaleInput = z.infer<typeof updateDailySaleSchema>;

// Paying down a customer's Credit purchase of a specific grain sale
// item — the "Customer Udhaar" tab's own repayment path (see
// stock/actions.ts: getCustomerGrainCreditPurchases), deliberately
// separate from recordAccountTransaction's whole-account Udhaar
// repayment: a shopkeeper may have several outstanding grain
// purchases at once and needs to pay one off individually, same
// "pay per product/purchase, from that row" precedent payGrainDebt
// and payExpenseDebt already established. amount is capped at that
// item's own outstanding remainder in the action, not trusted from
// the client.
export const payGrainSaleItemCreditSchema = z
  .object({
    dailySaleItemId: z.string().uuid(),
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT"]),
    bankAccountId: z.string().uuid().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type PayGrainSaleItemCreditInput = z.infer<typeof payGrainSaleItemCreditSchema>;
