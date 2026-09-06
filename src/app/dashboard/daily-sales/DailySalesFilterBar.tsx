import { DailySalesAreaSelect } from "./DailySalesAreaSelect";
import { DailySalesAccountTypeSelect } from "./DailySalesAccountTypeSelect";
import { DailySalesSearchBox } from "./DailySalesSearchBox";
import { DailySalesDateRange } from "./DailySalesDateRange";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import type { DailySalesSearchParams } from "./searchParamsHref";

// Name search + area + account type + date range — an instant "what
// did this customer buy, and when" lookup on the Sales history page
// itself, without having to already know which customer detail page
// to open.
export function DailySalesFilterBar({
  searchParams,
  areas,
  accountTypes,
}: {
  searchParams: DailySalesSearchParams;
  areas: Awaited<ReturnType<typeof listAreas>>;
  accountTypes: Awaited<ReturnType<typeof listAccountTypes>>;
}) {
  return (
    <div className="filter-bar">
      <DailySalesAreaSelect areas={areas} activeArea={searchParams.area ?? ""} />
      <DailySalesAccountTypeSelect accountTypes={accountTypes} activeAccountType={searchParams.accountType ?? ""} />
      <DailySalesDateRange activeFrom={searchParams.from ?? ""} activeTo={searchParams.to ?? ""} />
      <DailySalesSearchBox activeSearch={searchParams.search ?? ""} />
    </div>
  );
}
