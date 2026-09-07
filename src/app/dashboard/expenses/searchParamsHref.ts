export type ExpensesSearchParams = {
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

  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);

  const qs = params.toString();
  return `/dashboard/expenses${qs ? `?${qs}` : ""}`;
}
