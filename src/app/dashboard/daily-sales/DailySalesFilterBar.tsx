import { DailySalesAreaSelect } from "./DailySalesAreaSelect";
import { DailySalesAccountTypeSelect } from "./DailySalesAccountTypeSelect";
import { DailySalesSearchBox } from "./DailySalesSearchBox";
import { DailySalesDatePicker } from "./DailySalesDatePicker";
import { toLocalDateString } from "@/lib/utils";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import type { DailySalesSearchParams } from "./searchParamsHref";

// Name search + area + account type + date — an instant "what
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
  const today = toLocalDateString(new Date());

  return (
    <div className="pill-filter-bar">
      <DailySalesAreaSelect areas={areas} activeArea={searchParams.area ?? ""} />
      <DailySalesAccountTypeSelect accountTypes={accountTypes} activeAccountType={searchParams.accountType ?? ""} />
      <DailySalesDatePicker
        activeDate={searchParams.date || today}
        isToday={!searchParams.date || searchParams.date === today}
      />
      <DailySalesSearchBox activeSearch={searchParams.search ?? ""} />
    </div>
  );
}
