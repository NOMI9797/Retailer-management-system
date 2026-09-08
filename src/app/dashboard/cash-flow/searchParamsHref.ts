import { toLocalDateString } from "@/lib/utils";

export type CashFlowSearchParams = {
  date?: string;
};

export function buildCashFlowHref(
  current: CashFlowSearchParams,
  overrides: Partial<CashFlowSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.date) params.set("date", merged.date);

  const qs = params.toString();
  return `/dashboard/cash-flow${qs ? `?${qs}` : ""}`;
}

export function todayDateString() {
  return toLocalDateString(new Date());
}
