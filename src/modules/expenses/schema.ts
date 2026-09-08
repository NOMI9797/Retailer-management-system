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

// Settings-managed list of recurring monthly bills (Electricity,
// AC, Rent, ...) — same shape as Category/Unit, just a name the
// shopkeeper maintains rather than typing free text every time.
export const monthlyExpenseTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
});
export type MonthlyExpenseTypeInput = z.infer<typeof monthlyExpenseTypeSchema>;

export const updateMonthlyExpenseTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMonthlyExpenseTypeInput = z.infer<typeof updateMonthlyExpenseTypeSchema>;

// A monthly expense always picks one of the Settings-managed types
// instead of typing a free-text description — description is still
// stored on the row (set to the type's name at creation time) so
// Expense keeps one consistent shape between DAILY and MONTHLY rows,
// but the source of truth for "which bill" is monthlyExpenseTypeId.
export const monthlyExpenseSchema = z.object({
  monthlyExpenseTypeId: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  expenseDate: z.string().min(1, "Date is required"),
  paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
});
export type MonthlyExpenseInput = z.infer<typeof monthlyExpenseSchema>;

export const updateMonthlyExpenseSchema = z.object({
  id: z.string().uuid(),
  monthlyExpenseTypeId: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  expenseDate: z.string().min(1, "Date is required"),
  paymentMethod: z.enum(["CASH", "ACCOUNT", "CREDIT"]),
});
export type UpdateMonthlyExpenseInput = z.infer<typeof updateMonthlyExpenseSchema>;
