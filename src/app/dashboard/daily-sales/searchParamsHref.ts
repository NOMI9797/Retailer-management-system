export type DailySalesSearchParams = {
  customer?: string;
  search?: string;
  area?: string;
  accountType?: string;
  // "YYYY-MM-DD"; absent means today (see listDailyLedger).
  date?: string;
};

// Same pattern as products/customers searchParamsHref.
export function buildDailySalesHref(
  current: DailySalesSearchParams,
  overrides: Partial<DailySalesSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.customer) params.set("customer", merged.customer);
  if (merged.search) params.set("search", merged.search);
  if (merged.area) params.set("area", merged.area);
  if (merged.accountType) params.set("accountType", merged.accountType);
  if (merged.date) params.set("date", merged.date);

  const qs = params.toString();
  return `/dashboard/daily-sales${qs ? `?${qs}` : ""}`;
}
