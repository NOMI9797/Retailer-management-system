import { listProducts, getGrainStockSummary } from "@/modules/products/actions";
import {
  getStockOverview,
  listCustomerBatchesForProduct,
  listGrainLedger,
} from "@/modules/stock/actions";
import { GrainBatchList } from "@/modules/products/components/GrainBatchList";
import { listGrainLoans } from "@/modules/grain-loans/actions";
import { listDealers } from "@/modules/dealers/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import Link from "next/link";
import type { GrainSearchParams } from "./searchParamsHref";

// Async Server Component for the Grain tab: only the SELECTED grain
// product (picked in the page header's dropdown, ?product=) is
// rendered — one product at a time, not all stacked.
// listProducts (not listGrainProductDetailsForShop) is deliberately
// used here — it fetches only product name/id/category/unit, not
// every product's batches, since only the SELECTED product's batches
// are ever needed on screen at once now.
export async function GrainStockList({
  searchParams,
}: {
  searchParams: GrainSearchParams;
}) {
  // Pagination doesn't fit a tab-strip UI (every product needs to be
  // a visible tab, not spread across pages) — fetch a single large
  // page. 500 is already generous for one shop's product catalog; a
  // shop with more than that revisits this if it ever comes up.
  const { products } = await listProducts({
    stockKind: "GRAIN",
    pageSize: 500,
    includeInactive: true,
  });

  if (products.length === 0) {
    return (
      <div
        className="panel"
        style={{
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No grain products yet — add one to start tracking batches.
        </p>
        <Link
          href="/dashboard/settings?tab=grain-products"
          className="btn btn-primary"
        >
          Add grain product in Settings
        </Link>
      </div>
    );
  }

  const activeProduct =
    products.find((p) => p.id === searchParams.product) ?? products[0];

  const [summary, overview, customerBatches, ledger, loans, areas, dealers, bankAccounts] = await Promise.all([
    getGrainStockSummary(activeProduct.id),
    getStockOverview(activeProduct.id),
    listCustomerBatchesForProduct(activeProduct.id),
    listGrainLedger(activeProduct.id),
    listGrainLoans({ productId: activeProduct.id }),
    listAreas(),
    listDealers({ type: "GRAIN" }),
    listBankAccounts(),
  ]);

  return (
    <>
      <GrainBatchList
        product={activeProduct}
        batchCount={summary.batchCount}
        customerBatches={customerBatches}
        overview={overview}
        ledger={ledger}
        loans={loans}
        loanOptions={{
          areas,
          dealers: dealers.map((d) => ({ id: d.id, name: d.name })),
          bankAccounts,
        }}
      />
    </>
  );
}
