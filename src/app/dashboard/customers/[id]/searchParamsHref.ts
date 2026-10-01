// Purchase history / Grain / Udhaar to Shop are tabs on the customer
// detail page — real ?tab= navigation, same pattern as
// Settings/Expenses/Reports/New Sale. Accounts stays above the tabs,
// always visible — it's the customer's core financial summary, not
// one of the switched sections. Stock Udhaar deliberately has no tab
// here — see page.tsx's header comment. Grain has no subtabs of its
// own anymore — deposits/settlements and Credit purchases are merged
// into one chronological list (see CustomerGrainSection).
export type CustomerDetailSearchParams = {
  tab?: string;
};

export function buildCustomerDetailHref(
  customerId: string,
  overrides: Partial<CustomerDetailSearchParams>
) {
  const params = new URLSearchParams();
  if (overrides.tab && overrides.tab !== "purchase-history") params.set("tab", overrides.tab);
  const qs = params.toString();
  return `/dashboard/customers/${customerId}${qs ? `?${qs}` : ""}`;
}
