import { Suspense } from "react";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { CustomersHeader } from "./CustomersHeader";
import { CustomerFilterBar } from "./CustomerFilterBar";
import { CustomerTable } from "./CustomerTable";
import type { CustomersSearchParams } from "./searchParamsHref";

// Same architecture as Products: areas/account types (cached, cheap)
// fetched once here and shared with the header/filter bar so they
// render instantly; the customer list itself — the only genuinely
// per-navigation query — streams in behind its own Suspense boundary.
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
      <CustomerFilterBar searchParams={params} areas={areas} />

      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading customers…" />}>
        <CustomerTable searchParams={params} />
      </Suspense>
    </div>
  );
}
