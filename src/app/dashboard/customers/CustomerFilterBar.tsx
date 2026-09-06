import { AreaSelect } from "@/modules/customers/components/AreaSelect";
import { AccountTypeSelect } from "@/modules/customers/components/AccountTypeSelect";
import { CustomerSearchBox } from "@/modules/customers/components/CustomerSearchBox";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import type { CustomersSearchParams } from "./searchParamsHref";

export function CustomerFilterBar({
  searchParams,
  areas,
  accountTypes,
}: {
  searchParams: CustomersSearchParams;
  areas: Awaited<ReturnType<typeof listAreas>>;
  accountTypes: Awaited<ReturnType<typeof listAccountTypes>>;
}) {
  return (
    <div className="filter-bar">
      <AreaSelect areas={areas} activeArea={searchParams.area ?? ""} />
      <AccountTypeSelect accountTypes={accountTypes} activeAccountType={searchParams.accountType ?? ""} />
      <CustomerSearchBox activeSearch={searchParams.search ?? ""} />
    </div>
  );
}
