import { AreaSelect } from "@/modules/customers/components/AreaSelect";
import { CustomerSearchBox } from "@/modules/customers/components/CustomerSearchBox";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { CustomersSearchParams } from "./searchParamsHref";

export function CustomerFilterBar({
  searchParams,
  areas,
}: {
  searchParams: CustomersSearchParams;
  areas: Awaited<ReturnType<typeof listAreas>>;
}) {
  return (
    <div className="filter-bar">
      <AreaSelect areas={areas} activeArea={searchParams.area ?? ""} />
      <CustomerSearchBox activeSearch={searchParams.search ?? ""} />
    </div>
  );
}
