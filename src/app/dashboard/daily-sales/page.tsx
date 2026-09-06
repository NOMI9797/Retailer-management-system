import { Suspense } from "react";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { DailySalesHeader } from "./DailySalesHeader";
import { DailySalesStatRow } from "./DailySalesStatRow";
import { DailySalesFilterBar } from "./DailySalesFilterBar";
import { SalesHistoryTable } from "./SalesHistoryTable";
import type { DailySalesSearchParams } from "./searchParamsHref";

// The entry form now lives on its own route (/daily-sales/new) rather
// than a modal here — this page is just the header + today's stat row
// + filters + history list. Areas/account types are cached, cheap
// lookups fetched once here and shared with the filter bar so it
// renders instantly; the stat row and history list are each their own
// genuinely per-navigation query, so each streams in behind its own
// Suspense boundary rather than blocking the other.
export default async function DailySalesPage({
  searchParams,
}: {
  searchParams: Promise<DailySalesSearchParams>;
}) {
  const params = await searchParams;
  const [areas, accountTypes] = await Promise.all([listAreas(), listAccountTypes()]);

  return (
    <div>
      <DailySalesHeader />

      <Suspense fallback={<PageLoader label="Loading today's stats…" />}>
        <DailySalesStatRow />
      </Suspense>

      <DailySalesFilterBar searchParams={params} areas={areas} accountTypes={accountTypes} />

      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading sales history…" />}>
        <SalesHistoryTable searchParams={params} />
      </Suspense>
    </div>
  );
}
