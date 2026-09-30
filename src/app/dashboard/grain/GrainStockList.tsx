import Link from "next/link";
import { listProducts, getGrainStockSummary } from "@/modules/products/actions";
import { getStockOverview, listCustomerBatchesForProduct, getShopOwedForGrain } from "@/modules/stock/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { GrainBatchList } from "@/modules/products/components/GrainBatchList";
import { buildGrainHref, type GrainSearchParams } from "./searchParamsHref";

// Async Server Component for the Grain tab: a sub-tab strip of every
// grain product (Channa / Cotton / Wheat / ...), with only the
// SELECTED product's summary + batch table rendered below — one
// product at a time, per the "sub-tabs, not all stacked" decision.
// listProducts (not listGrainProductDetailsForShop) is deliberately
// used here — it fetches only product name/id/category/unit, not
// every product's batches, since only the SELECTED product's batches
// are ever needed on screen at once now.
export async function GrainStockList({ searchParams }: { searchParams: GrainSearchParams }) {
  // Pagination doesn't fit a tab-strip UI (every product needs to be
  // a visible tab, not spread across pages) — fetch a single large
  // page. 500 is already generous for one shop's product catalog; a
  // shop with more than that revisits this if it ever comes up.
  const { products } = await listProducts({ stockKind: "GRAIN", pageSize: 500 });

  if (products.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No grain products yet — add one to start tracking batches.
        </p>
      </div>
    );
  }

  const activeProduct = products.find((p) => p.id === searchParams.product) ?? products[0];

  const [summary, overview, customerBatches, owedEntries, areas] = await Promise.all([
    getGrainStockSummary(activeProduct.id),
    getStockOverview(activeProduct.id),
    listCustomerBatchesForProduct(activeProduct.id),
    // Scoped to THIS product — see getShopOwedForGrain's comment on
    // why a customer's debt is now tracked per product, not combined.
    getShopOwedForGrain(undefined, activeProduct.id),
    listAreas(),
  ]);
  const owedByCustomer = new Map(owedEntries.map((e) => [e.customerId, e.amountOwed]));

  return (
    <>
      <div className="tabs" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {products.map((product) => (
          <Link
            key={product.id}
            className={`tab${product.id === activeProduct.id ? " active" : ""}`}
            href={buildGrainHref(searchParams, { product: product.id })}
          >
            {product.name}
          </Link>
        ))}
      </div>

      <GrainBatchList
        product={activeProduct}
        batchCount={summary.batchCount}
        customerBatches={customerBatches}
        overview={overview}
        owedByCustomer={owedByCustomer}
        areas={areas}
      />
    </>
  );
}
