// Simple stock only — Grain moved to its own page (/dashboard/grain),
// so there's no tab/grainPage param here anymore.
export type ProductsSearchParams = {
  category?: string;
  search?: string;
  page?: string;
  addProduct?: string;
  editProduct?: string;
};

// Builds a /dashboard/products URL from the current search params
// with the given overrides applied — the one place link hrefs are
// assembled, so filters/pagination all agree on param names.
export function buildProductsHref(
  current: ProductsSearchParams,
  overrides: Partial<ProductsSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.category) params.set("category", merged.category);
  if (merged.search) params.set("search", merged.search);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);
  if (merged.addProduct) params.set("addProduct", merged.addProduct);
  if (merged.editProduct) params.set("editProduct", merged.editProduct);

  const qs = params.toString();
  return `/dashboard/products${qs ? `?${qs}` : ""}`;
}
