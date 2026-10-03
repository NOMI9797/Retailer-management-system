import { z } from "zod";

// A bulk supplier/buyer the shop does business with — fully separate
// from Customer. type is fixed to one kind (never both) per
// Dealer.type's schema comment: a Dealer is either a PRODUCTS dealer
// (bulk Simple-stock purchases) or a GRAIN dealer (grain batches),
// deciding which flows/pickers this dealer appears in.
export const dealerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  type: z.enum(["PRODUCTS", "GRAIN"]),
});
export type DealerInput = z.infer<typeof dealerSchema>;

export const updateDealerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDealerInput = z.infer<typeof updateDealerSchema>;

// One bulk purchase of Simple stock from a PRODUCTS-type dealer — see
// DealerProductPurchase's schema comment for how this bumps
// Product.quantity/costPrice. bankAccountId is required whenever
// paymentMethod is ACCOUNT — same "Account must always say which bank
// account" rule every other payment-method schema in the app applies
// (see BankAccount's schema comment).
export const dealerProductPurchaseSchema = z
  .object({
    dealerId: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.number().positive("Quantity must be positive"),
    costPrice: z.number().positive("Cost price must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    purchaseDate: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type DealerProductPurchaseInput = z.infer<typeof dealerProductPurchaseSchema>;

// One bulk grain purchase from a GRAIN-type dealer — always a real,
// immediate buy at an agreed rate (unlike a customer's "store for
// later" deposit, a dealer purchase has no unsettled/rate-less state
// — see GrainBatch.dealerId's schema comment), so rate is always
// required here, never optional the way grainBatchSchema's is for a
// customer deposit.
export const dealerGrainPurchaseSchema = z
  .object({
    dealerId: z.string().uuid(),
    productId: z.string().uuid(),
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
export type DealerGrainPurchaseInput = z.infer<typeof dealerGrainPurchaseSchema>;

// A manual entry growing what the shop owes a dealer — NOT tied to a
// specific purchase (e.g. an opening balance brought into this
// module, or a lump adjustment). Always CREDIT: no real cash moves
// when debt is simply being recorded, only when it's later paid down
// (see payDealerDebtSchema below) — mirrors createShopBorrowedLoan's
// own OUT-side action, kept separate from its repayment rather than
// one combined schema with a free payment-method choice on both
// directions, since only the repayment leg is ever a real payment.
export const recordDealerDebtSchema = z.object({
  dealerId: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  notes: z.string().optional(),
});
export type RecordDealerDebtInput = z.infer<typeof recordDealerDebtSchema>;

// Paying down what the shop owes a dealer — amount is capped at the
// dealer's own outstanding balance in the action, not trusted from
// the client. CREDIT is not offered here, same reasoning
// payShopBorrowedLoanSchema/payGrainDebtSchema already established: a
// repayment is never itself "not yet paid."
export const payDealerDebtSchema = z
  .object({
    dealerId: z.string().uuid(),
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT"]),
    bankAccountId: z.string().uuid().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type PayDealerDebtInput = z.infer<typeof payDealerDebtSchema>;
