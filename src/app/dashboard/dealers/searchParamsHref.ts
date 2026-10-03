export type DealersSearchParams = {
  // Top-level tab — "products" (default), "grain", or "accounts".
  // Same ?tab= pattern the Grain page's own Grain/Stock Udhaar
  // switcher uses.
  tab?: string;
};

export function buildDealersHref(overrides: Partial<DealersSearchParams>) {
  const params = new URLSearchParams();
  if (overrides.tab && overrides.tab !== "products") params.set("tab", overrides.tab);
  const qs = params.toString();
  return `/dashboard/dealers${qs ? `?${qs}` : ""}`;
}
