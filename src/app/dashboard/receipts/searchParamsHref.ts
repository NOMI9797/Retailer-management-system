import { toLocalDateString } from "@/lib/utils";

export type ReceiptsSearchParams = {
  date?: string;
  // "ledger" = the Ledger receipts tab; absent = sale receipts.
  tab?: string;
};

export function buildReceiptsHref(
  current: ReceiptsSearchParams,
  overrides: Partial<ReceiptsSearchParams>,
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.date) params.set("date", merged.date);
  if (merged.tab) params.set("tab", merged.tab);

  const qs = params.toString();
  return `/dashboard/receipts${qs ? `?${qs}` : ""}`;
}

export function todayDateString() {
  return toLocalDateString(new Date());
}
