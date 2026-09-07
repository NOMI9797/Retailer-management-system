import { z } from "zod";

// An expense is always tagged with exactly one payment method — unlike
// a Daily Sale, there's no split-across-methods concept here (you
// don't pay one bill partly cash, partly on account, partly credit).
// Cash Flow depends on this being set correctly from day one: only
// CASH expenses ever subtract from the physical cash-in-hand figure.
export const expenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  expenseDate: z.string().min(1, "Date is required"),
  paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const updateExpenseSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  expenseDate: z.string().min(1, "Date is required"),
  paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
