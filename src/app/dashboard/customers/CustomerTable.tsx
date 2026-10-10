import { listCustomers } from "@/modules/customers/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { CustomerList } from "./CustomerList";
import type { CustomersSearchParams } from "./searchParamsHref";

// Server Component: does the actual per-navigation fetch (the
// filtered/paginated customer list, plus the area list
// EditCustomerModal needs for its picker) and hands everything to
// CustomerList, the client leaf that owns the Edit modal's local
// open/close state — same split SalesHistoryTable/SalesHistoryList
// follows.
export async function CustomerTable({ searchParams }: { searchParams: CustomersSearchParams }) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const [result, areas] = await Promise.all([
    listCustomers({
      search: searchParams.search,
      areaId: searchParams.area,
      accountTypeId: searchParams.accountType,
      page,
    }),
    listAreas(),
  ]);

  return <CustomerList result={result} searchParams={searchParams} areas={areas} />;
}
