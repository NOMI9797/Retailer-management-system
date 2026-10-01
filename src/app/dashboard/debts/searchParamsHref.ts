// Two levels of tabs, both real ?query navigation, same pattern as
// Settings/Expenses/Reports/New Sale: `group` picks Customers vs Shop
// Udhaar, `tab` picks the subtab within whichever group is active
// (Regular/Long-term/Defaulters under Customers; Credit Expenses/
// Borrowed under Shop). Kept as two separate params rather than one
// combined string so switching `tab` alone (the common case, clicking
// a subtab) never has to also restate `group`.
export type DebtsSearchParams = {
  group?: string;
  tab?: string;
  // Which grain product the Grain Udhaar subtab (either group) is
  // filtered to — "all" (default, omitted from the URL) or a real
  // product id. Ignored on every other tab.
  product?: string;
};

export function buildDebtsHref(overrides: Partial<DebtsSearchParams>) {
  const params = new URLSearchParams();
  if (overrides.group) params.set("group", overrides.group);
  if (overrides.tab) params.set("tab", overrides.tab);
  if (overrides.product && overrides.product !== "all") params.set("product", overrides.product);
  const qs = params.toString();
  return `/dashboard/debts${qs ? `?${qs}` : ""}`;
}
