export type DailySalesSearchParams = {
  customer?: string;
  from?: string;
  to?: string;
  page?: string;
};

// Same pattern as products/customers searchParamsHref.
export function buildDailySalesHref(
  current: DailySalesSearchParams,
  overrides: Partial<DailySalesSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.customer) params.set("customer", merged.customer);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);

  const qs = params.toString();
  return `/dashboard/daily-sales${qs ? `?${qs}` : ""}`;
}
