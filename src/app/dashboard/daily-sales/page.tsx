import { Suspense } from "react";
import { listCategories, listUnits, listProducts } from "@/modules/products/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { DailySalesHeader } from "./DailySalesHeader";
import { SalesHistoryTable } from "./SalesHistoryTable";
import type { DailySalesSearchParams } from "./searchParamsHref";

// Reference data (products, areas, account types — all cached or
// small) fetched once here and shared with the entry form; the
// history list is the only genuinely per-navigation query, so it's
// the only thing behind a Suspense boundary.
export default async function DailySalesPage({
  searchParams,
}: {
  searchParams: Promise<DailySalesSearchParams>;
}) {
  const params = await searchParams;
  const [areas, accountTypes, simpleProducts, grainProducts] = await Promise.all([
    listAreas(),
    listAccountTypes(),
    listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
    listProducts({ stockKind: "GRAIN", pageSize: 500 }),
  ]);

  return (
    <div>
      <DailySalesHeader
        areas={areas}
        accountTypes={accountTypes}
        products={[...simpleProducts.products, ...grainProducts.products]}
      />

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "28px 0 12px" }}>Sales history</h2>
      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading sales history…" />}>
        <SalesHistoryTable searchParams={params} />
      </Suspense>
    </div>
  );
}
