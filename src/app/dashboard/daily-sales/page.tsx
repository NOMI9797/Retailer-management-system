import { Suspense } from "react";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { DailySalesHeader } from "./DailySalesHeader";
import { DailySalesFilterBar } from "./DailySalesFilterBar";
import { SalesHistoryTable } from "./SalesHistoryTable";
import type { DailySalesSearchParams } from "./searchParamsHref";

// The entry form now lives on its own route (/daily-sales/new) rather
// than a modal here — this page is just the header + filters +
// history list. Areas/account types are cached, cheap lookups fetched
// once here and shared with the filter bar so it renders instantly;
// the history list itself — the only genuinely per-navigation query —
// streams in behind its own Suspense boundary.
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
      <DailySalesFilterBar searchParams={params} areas={areas} accountTypes={accountTypes} />

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "28px 0 12px" }}>Sales history</h2>
      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading sales history…" />}>
        <SalesHistoryTable searchParams={params} />
      </Suspense>
    </div>
  );
}
