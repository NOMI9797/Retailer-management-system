export type DealerDetailSearchParams = {
  tab?: string;
};

// Same real-navigation ?tab= pattern as the customer detail page's
// own searchParamsHref.
export function buildDealerDetailHref(dealerId: string, overrides: Partial<DealerDetailSearchParams>) {
  const params = new URLSearchParams();
  if (overrides.tab && overrides.tab !== "purchases") params.set("tab", overrides.tab);
  const qs = params.toString();
  return `/dashboard/dealers/${dealerId}${qs ? `?${qs}` : ""}`;
}
