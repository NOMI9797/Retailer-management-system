import { toLocalDateString } from "@/lib/utils";

export type ReceiptsSearchParams = {
  date?: string;
};

export function buildReceiptsHref(
  current: ReceiptsSearchParams,
  overrides: Partial<ReceiptsSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.date) params.set("date", merged.date);

  const qs = params.toString();
  return `/dashboard/receipts${qs ? `?${qs}` : ""}`;
}

export function todayDateString() {
  return toLocalDateString(new Date());
}
