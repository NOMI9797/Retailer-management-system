export type BankAccountsSearchParams = {
  bankAccount?: string;
  from?: string;
  to?: string;
  page?: string;
};

// Same URL-driven filter pattern as Daily Sales' own searchParamsHref.
export function buildBankAccountsHref(
  current: BankAccountsSearchParams,
  overrides: Partial<BankAccountsSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.bankAccount) params.set("bankAccount", merged.bankAccount);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);

  const qs = params.toString();
  return `/dashboard/bank-accounts${qs ? `?${qs}` : ""}`;
}
