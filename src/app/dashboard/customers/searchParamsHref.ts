export type CustomersSearchParams = {
  search?: string;
  area?: string;
  page?: string;
};

// Builds a /dashboard/customers URL from the current search params
// with the given overrides applied — same pattern as
// products/searchParamsHref.ts, one place link hrefs are assembled.
export function buildCustomersHref(
  current: CustomersSearchParams,
  overrides: Partial<CustomersSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.search) params.set("search", merged.search);
  if (merged.area) params.set("area", merged.area);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);

  const qs = params.toString();
  return `/dashboard/customers${qs ? `?${qs}` : ""}`;
}
