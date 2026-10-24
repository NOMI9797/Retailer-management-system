import { listProducts } from "@/modules/products/actions";
import {
  getStockUdhaarSummary,
  getStockUdhaarTotals,
} from "@/modules/stock/actions";
import { StockUdhaarPanel } from "@/modules/stock/components/StockUdhaarPanel";
import type { GrainSearchParams } from "./searchParamsHref";

// Stock Udhaar tab content for ONE grain product — picked in the page
// header's grain dropdown (?product=), same as the Grain tab — per the "separate for each grain type, like it already is
// for one product" request, instead of one combined table across
// every product at once. Each product's subtab gets its OWN scoped
// stat cards (that product's own shortage, that product's own
// customer count) via getStockUdhaarSummary/getStockUdhaarTotals's
// existing productId scoping — no new aggregation logic needed, this
// is purely a UI reorganization over data both functions already
// supported.
export async function GrainUdhaarSection({
  searchParams,
}: {
  searchParams: GrainSearchParams;
}) {
  const { products } = await listProducts({
    stockKind: "GRAIN",
    pageSize: 500,
  });

  if (products.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No grain products yet — add one in Settings → Grain products.
        </p>
      </div>
    );
  }

  const activeProduct =
    products.find((p) => p.id === searchParams.product) ?? products[0];

  const [entries, totals] = await Promise.all([
    getStockUdhaarSummary(undefined, activeProduct.id),
    getStockUdhaarTotals(activeProduct.id),
  ]);

  return (
    <>
      {totals.byUnit.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <p className="stat-label">Shortage</p>
            <p className="stat-value tone-grain">
              {totals.byUnit
                .map((u) => `${u.quantity.toLocaleString()} ${u.unitName}`)
                .join(" · ")}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Customers owed stock</p>
            <p className="stat-value">{totals.customerCount}</p>
          </div>
        </div>
      )}
      <StockUdhaarPanel
        entries={entries}
        showProduct={false}
        emptyLabel={`No outstanding Stock Udhaar for ${activeProduct.name}.`}
      />
    </>
  );
}
