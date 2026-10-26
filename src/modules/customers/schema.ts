import { z } from "zod";

// Every module keeps its validation schema next to its actions, and
// derives form types from it — one source of truth for "what does a
// valid customer look like", shared by the form, the action, and the
// TypeScript types around both.
export const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  areaId: z.string().uuid().optional(),
  notes: z.string().optional(),
  accountTypeIds: z.array(z.string().uuid()).default([]),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const updateCustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").optional(),
  phone: z.string().optional(),
  areaId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// Manually records a loan given or a repayment received on a Udhaar or
// Regular account (the only two account kinds this milestone's Debt
// tracking covers) — the one write path both the Customer Accounts
// ledger view and the Debts page's quick action share, so there is
// exactly one implementation of the balance math, never two that
// could drift. A Stock Management transfer-purchase payout posts
// directly (see stock/actions.ts) and is NOT recorded through this
// action, since it uses the opposite balance-sign meaning.
//
// bankAccountId is required whenever paymentMethod is ACCOUNT — money
// moving through "Account" must always say WHICH bank account (see
// BankAccount's schema comment) — enforced by the .refine() below,
// the one place this rule is written so every payment-method schema
// in the app applies it identically.
export const recordAccountTransactionSchema = z
  .object({
    customerAccountId: z.string().uuid(),
    direction: z.enum(["IN", "OUT"]),
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    // "YYYY-MM-DD" — only meaningful on a loan given (direction OUT);
    // optional even then, since not every loan needs a formal due date.
    dueDate: z.string().optional(),
    // Set by importLegacyUdhaar only (see AccountTransaction.reference).
    reference: z.string().trim().optional(),
    notes: z.string().optional(),
    // Marks this posting as belonging to the Long-term Udhaar bucket
    // rather than Regular/Daily Udhaar — both share the same account/
    // balance, so this is the only thing distinguishing which "tab" a
    // loan or repayment belongs to (see AccountTransaction.isLongTerm's
    // schema comment). A repayment must be explicitly tagged to match
    // the loan it's clearing; there's no automatic attribution.
    isLongTerm: z.boolean().default(false),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type RecordAccountTransactionInput = z.infer<typeof recordAccountTransactionSchema>;

// Editing an already-recorded Regular/Long-term Udhaar entry (a loan
// given or a repayment, including an imported legacy balance — see
// ImportUdhaarModal) or a Shop Borrowed entry — amount, payment
// method/bank account, due date, and notes only. direction/isLongTerm/
// isShopBorrowed are deliberately NOT editable here — changing which
// bucket or direction a record belongs to isn't "fixing a typo," it's
// a different kind of record entirely, so that needs a delete + a
// fresh entry of the right kind instead (same as every other part of
// this app treats cross-bucket moves).
export const updateAccountTransactionSchema = z
  .object({
    id: z.string().uuid(),
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    dueDate: z.string().optional(),
    // Only applied to an OUT entry (Udhaar to Shop, or an imported
    // balance), and never clears an existing one.
    reference: z.string().trim().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type UpdateAccountTransactionInput = z.infer<typeof updateAccountTransactionSchema>;

// One Udhaar payment from a customer, as a single total — the
// shopkeeper never picks which entry it's for. It's spread over every
// entry they owe (Regular, Grain, Long-term, imported), oldest first,
// whenever balances are read (see debts/udhaarLedger.ts). Can't exceed
// what they owe in total.
export const recordCustomerUdhaarPaymentSchema = z
  .object({
    customerId: z.string().uuid(),
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT"]),
    bankAccountId: z.string().uuid().optional(),
    // Slip / register reference, required on every payment.
    reference: z.string().trim().min(1, "Enter a reference"),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type RecordCustomerUdhaarPaymentInput = z.infer<typeof recordCustomerUdhaarPaymentSchema>;

// Long-term Udhaar's own creation form: amount plus a duration picked
// from a fixed set of choices (days/months), rather than a free date
// picker — the return date is always DERIVED (today + duration), never
// typed directly, per the "auto-calculated" requirement. Writes
// through recordAccountTransaction under the hood with isLongTerm:
// true and the computed dueDate, so it's still exactly one balance-
// math implementation, not a second one.
export const durationUnitSchema = z.enum(["DAYS", "WEEKS", "MONTHS"]);
export type DurationUnit = z.infer<typeof durationUnitSchema>;

// Takes customerId rather than customerAccountId, since a long-term
// loan can be the very first Udhaar activity a customer ever has —
// the action auto-finds-or-creates their Udhar account, same pattern
// applyPaymentSplit already uses for Credit sales (see
// daily-sales/actions.ts).
export const createLongTermLoanSchema = z
  .object({
    customerId: z.string().uuid(),
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
    bankAccountId: z.string().uuid().optional(),
    durationValue: z.number().int().positive("Duration must be a positive whole number"),
    durationUnit: durationUnitSchema,
    // Slip / register reference, required on every payment.
    reference: z.string().trim().min(1, "Enter a reference"),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type CreateLongTermLoanInput = z.infer<typeof createLongTermLoanSchema>;

// The Shop (Udhaar) tab's "borrow from a customer" entry point — the
// mirror of createLongTermLoanSchema: here the SHOP is the one taking
// cash, with a due date for when it must pay the customer back. Same
// "duration picked from a fixed set of choices, due date always
// derived" shape as Long-term Udhaar, for the same reason (no free
// date picker, per that feature's precedent).
export const createShopBorrowedLoanSchema = z
  .object({
    customerId: z.string().uuid(),
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT"]),
    bankAccountId: z.string().uuid().optional(),
    durationValue: z.number().int().positive("Duration must be a positive whole number"),
    durationUnit: durationUnitSchema,
    // Who/what this Udhaar to Shop came through — required, shown
    // everywhere the entry is listed (see AccountTransaction.reference).
    reference: z.string().trim().min(1, "Enter a reference"),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type CreateShopBorrowedLoanInput = z.infer<typeof createShopBorrowedLoanSchema>;

// The shop paying a customer back, as one total — never per entry.
// Spread over everything the shop owes them (borrowed money, grain
// bought from them on Udhaar), oldest first, whenever balances are
// read (debts/udhaarLedger.ts). CREDIT is deliberately not an option:
// a repayment is never itself "not yet paid."
export const payShopUdhaarSchema = z
  .object({
    customerId: z.string().uuid(),
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.enum(["CASH", "ACCOUNT"]),
    bankAccountId: z.string().uuid().optional(),
    // Slip / register reference, required on every payment.
    reference: z.string().trim().min(1, "Enter a reference"),
    notes: z.string().optional(),
  })
  .refine((data) => data.paymentMethod !== "ACCOUNT" || !!data.bankAccountId, {
    message: "Select which bank account this was paid through",
    path: ["bankAccountId"],
  });
export type PayShopUdhaarInput = z.infer<typeof payShopUdhaarSchema>;

// A legacy Udhaar balance carried over from the shopkeeper's paper
// register, entered once while moving to this software — not a new
// loan given today, just an existing debt being recorded here for the
// first time. Always posts as CREDIT (no real cash/bank movement
// happens from entering old data — see importLegacyUdhaar's comment).
// sourceKind is purely a label on the resulting transaction's notes
// for the shopkeeper's own bookkeeping clarity — it never feeds the
// real per-batch Stock Udhaar system (that requires an actual
// GrainBatch, which an import has none of).
//
// owedBy picks which direction this balance runs — CUSTOMER (the
// default, existing behavior: the customer owes the shop, posted to
// the shop's own loan-type account, same as createLongTermLoan) or
// SHOP (the new case: the shop owes the customer money — e.g. an
// old, never-settled grain deposit or purchase from before this
// software was in use — posted with isShopBorrowed: true instead,
// the same bucket createShopBorrowedLoan/payShopUdhaar already
// use, so it shows up on the exact same "Borrowed from Customers"
// subtab and totals a real one does).
// reference is required in both directions — every imported balance
// records where it came from (see AccountTransaction.reference).
export const importLegacyUdhaarSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  sourceKind: z.enum(["PRODUCT", "GRAIN"]),
  owedBy: z.enum(["CUSTOMER", "SHOP"]).default("CUSTOMER"),
  recoveryDate: z.string().optional(),
  reference: z.string().trim().min(1, "Enter a reference"),
  notes: z.string().optional(),
});
export type ImportLegacyUdhaarInput = z.infer<typeof importLegacyUdhaarSchema>;
