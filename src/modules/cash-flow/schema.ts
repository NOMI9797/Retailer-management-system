import { z } from "zod";

// Day one (or the first time this shop ever opens Cash Flow) has no
// prior day's closing balance to carry forward — this one-time manual
// entry seeds it. Every later day's opening comes automatically from
// the previous day's actualClosing instead.
export const setOpeningBalanceSchema = z.object({
  date: z.string().min(1, "Date is required"),
  openingBalance: z.number(),
});
export type SetOpeningBalanceInput = z.infer<typeof setOpeningBalanceSchema>;

// Day close: the shopkeeper enters what they actually counted. The
// variance against expectedClosing is computed at read time, never
// stored (see DailyCashRegister's schema comment for why).
export const closeDaySchema = z.object({
  date: z.string().min(1, "Date is required"),
  actualClosing: z.number(),
});
export type CloseDayInput = z.infer<typeof closeDaySchema>;
