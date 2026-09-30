import { Suspense } from "react";
import Link from "next/link";
import { listCategories, listUnits } from "@/modules/products/actions";
import { GrainPageHeader } from "./GrainPageHeader";
import { GrainStockList } from "./GrainStockList";
import { GrainUdhaarSection } from "./GrainUdhaarSection";
import { CustomerGrainCreditSection } from "./CustomerGrainCreditSection";
import { PageLoader } from "@/components/shared/PageLoader";
import { buildGrainHref, type GrainSearchParams } from "./searchParamsHref";

// Grain's own top-level page — two top-level tabs (Grain / Stock
// Udhaar, via ?tab=), same real-navigation pattern as Expenses'
// Daily/Monthly switcher. Within the Grain tab, GrainStockList renders
// its own product sub-tabs (?product=). Within the Stock Udhaar tab,
// two further subtabs (?udhaarView=): "Shop Udhaar" (stock the shop
// itself owes customers — GrainUdhaarSection, unchanged) and
// "Customer Udhaar" (the mirror — customers who bought grain from the
// shop on Credit and haven't paid — CustomerGrainCreditSection).
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
  const udhaarView = params.udhaarView === "customer" ? "customer" : "shop";
  const [categories, units] = await Promise.all([listCategories(false, "GRAIN"), listUnits()]);

  return (
    <div>
      <GrainPageHeader searchParams={params} categories={categories} units={units} />

      {tab === "grain" ? (
        <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading grain stock…" />}>
          <GrainStockList searchParams={params} />
        </Suspense>
      ) : (
        <>
          <div className="tabs" style={{ marginBottom: 16 }}>
            <Link
              className={`tab${udhaarView === "shop" ? " active" : ""}`}
              href={buildGrainHref(params, { udhaarView: "shop" })}
            >
              Shop Udhaar
            </Link>
            <Link
              className={`tab${udhaarView === "customer" ? " active" : ""}`}
              href={buildGrainHref(params, { udhaarView: "customer" })}
            >
              Customer Udhaar
            </Link>
          </div>

          {udhaarView === "shop" ? (
            <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading Shop Udhaar…" />}>
              <GrainUdhaarSection searchParams={params} />
            </Suspense>
          ) : (
            <Suspense fallback={<PageLoader label="Loading Customer Udhaar…" />}>
              <CustomerGrainCreditSection />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
