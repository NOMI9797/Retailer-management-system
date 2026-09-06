import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { DailySalesHeader } from "./DailySalesHeader";
import { SalesHistoryTable } from "./SalesHistoryTable";
import type { DailySalesSearchParams } from "./searchParamsHref";

// The entry form now lives on its own route (/daily-sales/new) rather
// than a modal here — this page is just the header + history list,
// so the history list remains the only genuinely per-navigation
// query, behind its own Suspense boundary.
export default async function DailySalesPage({
  searchParams,
}: {
  searchParams: Promise<DailySalesSearchParams>;
}) {
  const params = await searchParams;

  return (
    <div>
      <DailySalesHeader />

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "28px 0 12px" }}>Sales history</h2>
      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading sales history…" />}>
        <SalesHistoryTable searchParams={params} />
      </Suspense>
    </div>
  );
}
