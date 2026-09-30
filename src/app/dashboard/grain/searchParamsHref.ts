export type GrainSearchParams = {
  // Top-level tab — "grain" (default) or "udhaar". Same ?tab= pattern
  // Expenses' Daily/Monthly switcher uses: a real navigation via
  // <Link>, not client-side state.
  tab?: string;
  // Which subtab is active WITHIN the Stock Udhaar tab — "shop"
  // (default: stock the shop owes customers, already implemented) or
  // "customer" (the mirror: customers who bought grain from the shop
  // on Credit and haven't paid yet). Ignored when tab !== "udhaar".
  udhaarView?: string;
  // Which product's sub-tab is active — reused across two different
  // contexts that never overlap (only one `tab` is ever active at
  // once): within the Grain tab (GrainStockList's own product
  // sub-tabs), and within the Stock Udhaar tab's Shop Udhaar subtab
  // (GrainUdhaarSection's per-product Stock Udhaar breakdown).
  // Defaults to the first product in the relevant list when omitted.
  product?: string;
  page?: string;
};

// Builds a /dashboard/grain URL from the current search params with
// the given overrides applied — same one-place-assembles-hrefs
// pattern as every other list page (see products/searchParamsHref.ts).
export function buildGrainHref(current: GrainSearchParams, overrides: Partial<GrainSearchParams>) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.tab && merged.tab !== "grain") params.set("tab", merged.tab);
  if (merged.udhaarView && merged.udhaarView !== "shop") params.set("udhaarView", merged.udhaarView);
  if (merged.product) params.set("product", merged.product);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);

  const qs = params.toString();
  return `/dashboard/grain${qs ? `?${qs}` : ""}`;
}
