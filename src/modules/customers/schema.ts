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
// could drift. Consignment/farmer payouts still post automatically
// from applySaleItems and are NOT recorded through this action.
export const recordAccountTransactionSchema = z.object({
  customerAccountId: z.string().uuid(),
  direction: z.enum(["IN", "OUT"]),
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
  // "YYYY-MM-DD" — only meaningful on a loan given (direction OUT);
  // optional even then, since not every loan needs a formal due date.
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  // Marks this posting as belonging to the Long-term Udhaar bucket
  // rather than Regular/Daily Udhaar — both share the same account/
  // balance, so this is the only thing distinguishing which "tab" a
  // loan or repayment belongs to (see AccountTransaction.isLongTerm's
  // schema comment). A repayment must be explicitly tagged to match
  // the loan it's clearing; there's no automatic attribution.
  isLongTerm: z.boolean().default(false),
});
export type RecordAccountTransactionInput = z.infer<typeof recordAccountTransactionSchema>;

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
export const createLongTermLoanSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
  durationValue: z.number().int().positive("Duration must be a positive whole number"),
  durationUnit: durationUnitSchema,
  notes: z.string().optional(),
});
export type CreateLongTermLoanInput = z.infer<typeof createLongTermLoanSchema>;
