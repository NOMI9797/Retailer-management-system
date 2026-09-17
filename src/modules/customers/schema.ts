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

// Manually records a loan given or a repayment received on a Udhar or
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
});
export type RecordAccountTransactionInput = z.infer<typeof recordAccountTransactionSchema>;
