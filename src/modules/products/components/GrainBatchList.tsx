import type {
  listCustomerBatchesForProduct,
  getStockOverview,
  listGrainLedger,
} from "@/modules/stock/actions";
import { StockSummary } from "./StockSummary";
import { GrainLedgerTabs } from "./GrainLedgerTabs";
import { GrainNameSearch } from "./GrainNameSearch";

type GrainProduct = {
  id: string;
  name: string;
  categoryId: string;
  unitId: string;
  isActive: boolean;
  category: { name: string };
  unit: { name: string };
};

type CustomerBatch = Awaited<
  ReturnType<typeof listCustomerBatchesForProduct>
>[number];
type Overview = Awaited<ReturnType<typeof getStockOverview>>;

// One selected grain product's page (picked in the page header's
// dropdown; its Add batch sits in the tab row, and adding/editing/
// deactivating grain products lives in Settings → Grain products):
// the stock cards (StockSummary), and the tabbed records
// (GrainLedgerTabs: sales, purchases, and deposits whose rate isn't
// settled yet). Plain Server Component — the interactive pieces (Add
// batch, the tabs' Buy from customer) call their Server Action then
// router.refresh().
export function GrainBatchList({
  product,
  customerBatches,
  overview,
  ledger,
}: {
  product: GrainProduct;
  batchCount: number;
  customerBatches: CustomerBatch[];
  overview: Overview;
  ledger: Awaited<ReturnType<typeof listGrainLedger>>;
}) {
  const unit = product.unit.name;

  return (
    <>
      {!product.isActive && (
        <p style={{ margin: "0 0 12px" }}>
          <span className="status-badge inactive">Inactive</span>
        </p>
      )}

      <StockSummary
        totalRemaining={overview.totalPhysical}
        unitName={unit}
        ownAvailable={overview.ownAvailable}
        customerClaim={overview.customerClaim}
        stockUdhaarOutstanding={overview.stockUdhaarOutstanding}
        pooled={overview.pooled}
        searchSlot={<GrainNameSearch />}
      />

      <GrainLedgerTabs
        ledger={ledger}
        customerBatches={customerBatches}
        unitName={unit}
      />
    </>
  );
}
