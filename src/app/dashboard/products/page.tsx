import { Suspense } from "react";
import { listCategories, listUnits } from "@/modules/products/actions";
import { ProductsHeader } from "./ProductsHeader";
import { ProductsStatRow } from "./ProductsStatRow";
import { CategoryFilterBar } from "./CategoryFilterBar";
import { SimpleStockTable } from "./SimpleStockTable";
import { PageLoader } from "@/components/shared/PageLoader";
import type { ProductsSearchParams } from "./searchParamsHref";

// Shell: fetches categories/units ONCE here and passes them down as
// props — Header, the filter bar, and the table all need the same
// reference data, so fetching it once and sharing it beats each
// section re-fetching its own copy. Simple stock only now — Grain
// moved to its own page (/dashboard/grain), so there's no tab to
// switch between here anymore.
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const params = await searchParams;
  const [categories, units] = await Promise.all([listCategories(false, "SIMPLE"), listUnits()]);

  return (
    <div>
      <ProductsHeader categories={categories} units={units} />

      <Suspense fallback={<PageLoader label="Loading stats…" />}>
        <ProductsStatRow />
      </Suspense>

      <CategoryFilterBar searchParams={params} categories={categories} />

      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading products…" />}>
        <SimpleStockTable searchParams={params} categories={categories} units={units} />
      </Suspense>
    </div>
  );
}
