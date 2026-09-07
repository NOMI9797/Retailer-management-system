export type CashFlowSearchParams = {
  date?: string;
  historyFrom?: string;
  historyTo?: string;
};

export function buildCashFlowHref(
  current: CashFlowSearchParams,
  overrides: Partial<CashFlowSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.date) params.set("date", merged.date);
  if (merged.historyFrom) params.set("historyFrom", merged.historyFrom);
  if (merged.historyTo) params.set("historyTo", merged.historyTo);

  const qs = params.toString();
  return `/dashboard/cash-flow${qs ? `?${qs}` : ""}`;
}

// "Today" in the server's local time, matching how every other date
// boundary in the app (findTodaysSale, listExpenses, dayBounds) is
// computed — never UTC, which would show the wrong day near midnight
// in a timezone ahead of UTC (like Pakistan's).
export function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
