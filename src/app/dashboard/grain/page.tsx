import { Suspense } from "react";
import { listCategories, listUnits } from "@/modules/products/actions";
import { GrainPageHeader } from "./GrainPageHeader";
import { GrainStockList } from "./GrainStockList";
import { GrainUdhaarSection } from "./GrainUdhaarSection";
import { PageLoader } from "@/components/shared/PageLoader";
import type { GrainSearchParams } from "./searchParamsHref";

// Grain's own top-level page — two top-level tabs (Grain / Stock
// Udhaar, via ?tab=), same real-navigation pattern as Expenses'
// Daily/Monthly switcher. Within the Grain tab, GrainStockList renders
// its own product sub-tabs (?product=). Stock Udhaar shows
// GrainUdhaarSection directly — the shop's own stock shortfall to
// customers. "Customer Udhaar" (money customers owe the shop for
// grain bought on Credit) now lives on the Debts page as a "Grain
// Udhaar" subtab under Customers (Udhaar), alongside the shop's other
// Udhaar buckets, rather than duplicated here — see
// CustomerGrainCreditSection, now rendered from debts/page.tsx.
// categories/units are fetched once here and passed down —
// GrainPageHeader's Add-product modal needs them, and only appears on
// the Grain tab.
export default async function GrainPage({
  searchParams,
}: {
  searchParams: Promise<GrainSearchParams>;
}) {
  const params = await searchParams;
  const tab = params.tab === "udhaar" ? "udhaar" : "grain";
  const [categories, units] = await Promise.all([listCategories(false, "GRAIN"), listUnits()]);

  return (
    <div>
      <GrainPageHeader searchParams={params} categories={categories} units={units} />

      {tab === "grain" ? (
        <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading grain stock…" />}>
          <GrainStockList searchParams={params} />
        </Suspense>
      ) : (
        <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading Stock Udhaar…" />}>
          <GrainUdhaarSection searchParams={params} />
        </Suspense>
      )}
    </div>
  );
}
