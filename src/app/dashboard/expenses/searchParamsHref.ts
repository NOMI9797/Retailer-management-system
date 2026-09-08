// Daily and Monthly expenses are tabs on the same page — only one is
// ever visible at a time (like Products' Simple/Grain stock tabs), so
// they share one set of from/to/page params rather than needing
// separate namespaced ones.
export type ExpensesSearchParams = {
  tab?: string;
  from?: string;
  to?: string;
  page?: string;
};

// Same pattern as daily-sales/customers/products searchParamsHref.
export function buildExpensesHref(
  current: ExpensesSearchParams,
  overrides: Partial<ExpensesSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.tab) params.set("tab", merged.tab);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);

  const qs = params.toString();
  return `/dashboard/expenses${qs ? `?${qs}` : ""}`;
}
