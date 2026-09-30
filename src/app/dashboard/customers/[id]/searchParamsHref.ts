// Purchase history / Grain / Udhaar to Shop are tabs on the customer
// detail page — real ?tab= navigation, same pattern as
// Settings/Expenses/Reports/New Sale. Accounts stays above the tabs,
// always visible — it's the customer's core financial summary, not
// one of the switched sections. Stock Udhaar deliberately has no tab
// here — see page.tsx's header comment.
export type CustomerDetailSearchParams = {
  tab?: string;
  // Which subtab is active WITHIN the Grain tab — "deposits" (default,
  // existing content: this customer's own deposits/settlements) or
  // "credit-purchases" (the mirror: grain this customer bought FROM
  // the shop on Credit and hasn't paid yet). Ignored when tab !== "grain".
  grainView?: string;
};

export function buildCustomerDetailHref(
  customerId: string,
  overrides: Partial<CustomerDetailSearchParams>
) {
  const params = new URLSearchParams();
  if (overrides.tab && overrides.tab !== "purchase-history") params.set("tab", overrides.tab);
  if (overrides.grainView && overrides.grainView !== "deposits") params.set("grainView", overrides.grainView);
  const qs = params.toString();
  return `/dashboard/customers/${customerId}${qs ? `?${qs}` : ""}`;
}
