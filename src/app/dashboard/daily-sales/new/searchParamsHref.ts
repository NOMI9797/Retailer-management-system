// New Sale and Udhaar Clearance are tabs on the same page — real
// ?tab= navigation, same pattern as Settings/Expenses/Reports.
export type NewSalePageSearchParams = {
  tab?: string;
};

export function buildNewSaleHref(overrides: Partial<NewSalePageSearchParams>) {
  const params = new URLSearchParams();
  if (overrides.tab) params.set("tab", overrides.tab);
  const qs = params.toString();
  return `/dashboard/daily-sales/new${qs ? `?${qs}` : ""}`;
}
