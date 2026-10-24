// The New entry screen: no ?tab shows the option grid, a ?tab shows
// that entry's form (see ENTRY_GROUPS in page.tsx for the keys).
export type NewSalePageSearchParams = {
  tab?: string;
};

export function buildNewSaleHref(overrides: Partial<NewSalePageSearchParams>) {
  const params = new URLSearchParams();
  if (overrides.tab) params.set("tab", overrides.tab);
  const qs = params.toString();
  return `/dashboard/daily-sales/new${qs ? `?${qs}` : ""}`;
}
