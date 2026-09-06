import { Suspense } from "react";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { CustomersHeader } from "./CustomersHeader";
import { CustomerStatRow } from "./CustomerStatRow";
import { CustomerFilterBar } from "./CustomerFilterBar";
import { CustomerTable } from "./CustomerTable";
import type { CustomersSearchParams } from "./searchParamsHref";

// Same architecture as Products: areas/account types (cached, cheap)
// fetched once here and shared with the header/filter bar so they
// render instantly; the stat row and customer list are each their own
// genuinely per-navigation query, so each streams in behind its own
// Suspense boundary rather than blocking the other.
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomersSearchParams>;
}) {
  const params = await searchParams;
  const [areas, accountTypes] = await Promise.all([listAreas(), listAccountTypes()]);

  return (
    <div>
      <CustomersHeader areas={areas} accountTypes={accountTypes} />

      <Suspense fallback={<PageLoader label="Loading stats…" />}>
        <CustomerStatRow />
      </Suspense>

      <CustomerFilterBar searchParams={params} areas={areas} accountTypes={accountTypes} />

      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading customers…" />}>
        <CustomerTable searchParams={params} />
      </Suspense>
    </div>
  );
}
