import { z } from "zod";

// Account Types (Settings) — the shopkeeper-managed list Customers
// pulls its account-type dropdown from. Custom fields per type are a
// separate nested schema since they're managed together in one form.

export const accountTypeFieldSchema = z.object({
  fieldName: z.string().min(1, "Field name is required"),
  fieldLabel: z.string().min(1, "Field label is required"),
  fieldType: z.enum(["TEXT", "NUMBER", "DATE", "DROPDOWN"]),
  isRequired: z.boolean().default(false),
  displayOrder: z.number().int().nonnegative().default(0),
});
export type AccountTypeFieldInput = z.infer<typeof accountTypeFieldSchema>;

export const accountTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z
    .string()
    .min(1, "Code is required")
    .regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, or underscores"),
  tracksQuantity: z.boolean().default(false),
  fields: z.array(accountTypeFieldSchema).default([]),
});
export type AccountTypeInput = z.infer<typeof accountTypeSchema>;

export const updateAccountTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").optional(),
  tracksQuantity: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAccountTypeInput = z.infer<typeof updateAccountTypeSchema>;

// Adding a field to an existing account type — same shape as the
// nested fields on accountTypeSchema, plus the parent id.
export const addAccountTypeFieldSchema = accountTypeFieldSchema.extend({
  accountTypeId: z.string().uuid(),
});
export type AddAccountTypeFieldInput = z.infer<typeof addAccountTypeFieldSchema>;

export const updateAccountTypeFieldSchema = z.object({
  id: z.string().uuid(),
  fieldName: z.string().min(1, "Field name is required").optional(),
  fieldLabel: z.string().min(1, "Field label is required").optional(),
  fieldType: z.enum(["TEXT", "NUMBER", "DATE", "DROPDOWN"]).optional(),
  isRequired: z.boolean().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});
export type UpdateAccountTypeFieldInput = z.infer<typeof updateAccountTypeFieldSchema>;
