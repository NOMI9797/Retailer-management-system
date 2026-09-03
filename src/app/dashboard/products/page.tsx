import { Suspense } from "react";
import { ProductsHeader } from "./ProductsHeader";
import { CategoryFilterBar } from "./CategoryFilterBar";
import { SimpleStockTable } from "./SimpleStockTable";
import { GrainStockPanel } from "./GrainStockPanel";
import { PageLoader } from "@/components/shared/PageLoader";
import type { ProductsSearchParams } from "./searchParamsHref";

// Shell only — no data fetching of its own. Each section below
// fetches its own data and streams in behind its own Suspense
// boundary, so a slow query in one section (typically the grain
// panel, which joins batches + owner customers) never blocks the
// others from appearing. Tab state and every filter live in the URL
// (searchParams), not client state, so switching tabs is a real
// navigation Next.js can stream — not a client flip that requires
// all the data to already be sitting in the browser.
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const params = await searchParams;
  const tab = params.tab === "grain" ? "grain" : "simple";

  return (
    <div>
      <ProductsHeader searchParams={params} />

      {tab === "simple" && (
        <Suspense fallback={<div className="filter-bar" />}>
          <CategoryFilterBar searchParams={params} />
        </Suspense>
      )}

      <Suspense
        key={JSON.stringify(params)}
        fallback={<PageLoader label={tab === "simple" ? "Loading products…" : "Loading grain stock…"} />}
      >
        {tab === "simple" ? (
          <SimpleStockTable searchParams={params} />
        ) : (
          <GrainStockPanel searchParams={params} />
        )}
      </Suspense>
    </div>
  );
}
