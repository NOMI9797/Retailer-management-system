import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

// A customer's ledger receipt: everything between them and the shop
// from one day to another, both days included ("YYYY-MM-DD").
export const ledgerReceiptSchema = z
  .object({
    customerId: z.string().uuid(),
    fromDate: dateString,
    toDate: dateString,
  })
  .refine((d) => d.fromDate <= d.toDate, {
    message: "The From date must be on or before the To date",
    path: ["toDate"],
  });
export type LedgerReceiptInput = z.infer<typeof ledgerReceiptSchema>;
