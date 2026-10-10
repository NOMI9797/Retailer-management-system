import { listDailySales } from "@/modules/daily-sales/actions";
import { listProducts } from "@/modules/products/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { SalesHistoryList } from "./SalesHistoryList";
import type { DailySalesSearchParams } from "./searchParamsHref";

// Server Component: does the actual per-navigation fetch (the
// filtered/paginated sales feed, plus the product and bank-account
// lists EditSaleModal needs on open) and hands everything to
// SalesHistoryList, the client leaf that owns Edit/Delete's local
// open/close state — same split GrainStockList/GrainBatchList follow.
// Summary rows only, per the milestone: customer, date, item count,
// total bill. Full line-item detail deliberately doesn't live here —
// clicking through goes to that customer's own detail page, where
// the purchase history panel shows the actual items (Edit/Delete here
// act on the same underlying sale either way). Also includes Udhaar
// Clearance rows (repayments) merged into the same date-sorted feed —
// a shopkeeper scanning "what happened today" sees sales AND money
// coming back in one list, each clearly tagged.
export async function SalesHistoryTable({ searchParams }: { searchParams: DailySalesSearchParams }) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const [result, simpleProducts, grainProducts, bankAccounts] = await Promise.all([
    listDailySales({
      customerId: searchParams.customer,
      search: searchParams.search,
      areaId: searchParams.area,
      accountTypeId: searchParams.accountType,
      fromDate: searchParams.from,
      toDate: searchParams.to,
      page,
    }),
    // includeInactive: an old sale may reference a product that's
    // since been deactivated — EditSaleModal still needs to resolve
    // and display that existing line item, even though a deactivated
    // product correctly no longer appears when picking a NEW item
    // elsewhere (NewSaleForm's own listProducts call has no such
    // override).
    listProducts({ stockKind: "SIMPLE", pageSize: 500, includeInactive: true }),
    listProducts({ stockKind: "GRAIN", pageSize: 500, includeInactive: true }),
    listBankAccounts(),
  ]);

  return (
    <SalesHistoryList
      result={result}
      searchParams={searchParams}
      products={[...simpleProducts.products, ...grainProducts.products]}
      bankAccounts={bankAccounts}
    />
  );
}
