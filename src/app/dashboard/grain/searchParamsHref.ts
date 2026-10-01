export type GrainSearchParams = {
  // Top-level tab — "grain" (default) or "udhaar". Same ?tab= pattern
  // Expenses' Daily/Monthly switcher uses: a real navigation via
  // <Link>, not client-side state.
  tab?: string;
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
  if (merged.product) params.set("product", merged.product);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);

  const qs = params.toString();
  return `/dashboard/grain${qs ? `?${qs}` : ""}`;
}
