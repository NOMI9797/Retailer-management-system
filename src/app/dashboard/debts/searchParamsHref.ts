// Regular/Daily Udhaar and Long-term Udhaar are tabs on the same
// page — real ?tab= navigation, same pattern as Settings/Expenses/
// Reports/New Sale.
export type DebtsSearchParams = {
  tab?: string;
};

export function buildDebtsHref(overrides: Partial<DebtsSearchParams>) {
  const params = new URLSearchParams();
  if (overrides.tab) params.set("tab", overrides.tab);
  const qs = params.toString();
  return `/dashboard/debts${qs ? `?${qs}` : ""}`;
}
