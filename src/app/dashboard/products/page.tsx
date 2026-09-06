import { Suspense } from "react";
import { listCategories, listUnits } from "@/modules/products/actions";
import { ProductsHeader } from "./ProductsHeader";
import { ProductsStatRow } from "./ProductsStatRow";
import { CategoryFilterBar } from "./CategoryFilterBar";
import { SimpleStockTable } from "./SimpleStockTable";
import { GrainStockPanel } from "./GrainStockPanel";
import { PageLoader } from "@/components/shared/PageLoader";
import type { ProductsSearchParams } from "./searchParamsHref";

// Shell: fetches categories/units ONCE here and passes them down as
// props — Header, the filter bar, and the table all need the same
// reference data, so fetching it once and sharing it beats each
// section re-fetching its own copy (even with caching, that's still
// 3 separate round trips instead of 1). The stat row and the active
// tab's table are each their own genuinely slow, independent query,
// so each gets its own Suspense boundary; categories/units are small
// and cached, so awaiting them directly here costs almost nothing.
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const params = await searchParams;
  const tab = params.tab === "grain" ? "grain" : "simple";
  const [categories, units] = await Promise.all([listCategories(), listUnits()]);

  return (
    <div>
      <ProductsHeader searchParams={params} categories={categories} units={units} />

      <Suspense fallback={<PageLoader label="Loading stats…" />}>
        <ProductsStatRow />
      </Suspense>

      {tab === "simple" && <CategoryFilterBar searchParams={params} categories={categories} />}

      <Suspense
        key={JSON.stringify(params)}
        fallback={<PageLoader label={tab === "simple" ? "Loading products…" : "Loading grain stock…"} />}
      >
        {tab === "simple" ? (
          <SimpleStockTable searchParams={params} categories={categories} units={units} />
        ) : (
          <GrainStockPanel searchParams={params} />
        )}
      </Suspense>
    </div>
  );
}
