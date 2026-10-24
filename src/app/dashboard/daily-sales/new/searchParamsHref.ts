// The New entry screen: no ?tab shows the option grid, a ?tab shows
// that entry's form (see ENTRY_SIDES in page.tsx for the keys).
// ?customer / ?dealer is the person picked first in the search box —
// the grid then shows their card, and each form opens with them
// already selected.
export type NewSalePageSearchParams = {
  tab?: string;
  customer?: string;
  dealer?: string;
};

export function buildNewSaleHref(overrides: Partial<NewSalePageSearchParams>) {
  const params = new URLSearchParams();
  if (overrides.tab) params.set("tab", overrides.tab);
  if (overrides.customer) params.set("customer", overrides.customer);
  if (overrides.dealer) params.set("dealer", overrides.dealer);
  const qs = params.toString();
  return `/dashboard/daily-sales/new${qs ? `?${qs}` : ""}`;
}
