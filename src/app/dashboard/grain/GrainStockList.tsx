import Link from "next/link";
import { listProducts, getGrainStockSummary } from "@/modules/products/actions";
import { getStockOverview, listCustomerBatchesForProduct } from "@/modules/stock/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
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

  const [summary, overview, customerBatches, areas, bankAccounts] = await Promise.all([
    getGrainStockSummary(activeProduct.id),
    getStockOverview(activeProduct.id),
    listCustomerBatchesForProduct(activeProduct.id),
    listAreas(),
    listBankAccounts(),
  ]);

  return (
    <>
      {/* Squared, full-width chips (not the plain underline .tab) so
          switching products is an obvious UI affordance — flex: 1 on
          each chip (see .product-chip) stretches them to fill the row. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {products.map((product) => (
          <Link
            key={product.id}
            className={`product-chip${product.id === activeProduct.id ? " active" : ""}`}
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
        areas={areas}
        bankAccounts={bankAccounts}
      />
    </>
  );
}
