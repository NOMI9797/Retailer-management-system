import { toLocalDateString } from "@/lib/utils";

export type CashFlowSearchParams = {
  date?: string;
  // "day" (default) | "week" | "month"
  period?: string;
};

export function buildCashFlowHref(current: CashFlowSearchParams, overrides: Partial<CashFlowSearchParams>) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.date) params.set("date", merged.date);
  if (merged.period && merged.period !== "day") params.set("period", merged.period);

  const qs = params.toString();
  return `/dashboard/cash-flow${qs ? `?${qs}` : ""}`;
}

export function todayDateString() {
  return toLocalDateString(new Date());
}

// The date one day / week / month before or after, for the ◀ ▶ arrows.
export function shiftDate(dateStr: string, period: string, step: 1 | -1) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (period === "week") date.setDate(date.getDate() + 7 * step);
  else if (period === "month") date.setMonth(date.getMonth() + step, 1);
  else date.setDate(date.getDate() + step);
  return toLocalDateString(date);
}
