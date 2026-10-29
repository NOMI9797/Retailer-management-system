import type {
  listCustomerBatchesForProduct,
  getStockOverview,
  listGrainLedger,
} from "@/modules/stock/actions";
import { StockSummary } from "./StockSummary";
import { GrainLedgerTabs } from "./GrainLedgerTabs";
import { GrainNameSearch } from "./GrainNameSearch";
import type { GrainLoanRow } from "@/modules/grain-loans/actions";
import type { LoanOptions } from "./GrainLedgerTabs";
import type { HomeGrainRow } from "@/modules/stock/homeGrain.actions";
import type { GrainRegisterStock } from "@/modules/grain-register/actions";

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
  loans,
  loanOptions,
  homeGrain,
  register,
  customerAdvance,
}: {
  product: GrainProduct;
  batchCount: number;
  customerBatches: CustomerBatch[];
  overview: Overview;
  ledger: Awaited<ReturnType<typeof listGrainLedger>>;
  loans: GrainLoanRow[];
  loanOptions: LoanOptions;
  homeGrain: HomeGrainRow[];
  // Own stock / value typed in from the register, if any.
  register: GrainRegisterStock;
  // Customers' Advance stock entries for this grain, added up per section.
  customerAdvance: { LOAN: number; HOME: number };
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
        stockValue={overview.ownValue}
        lentOut={overview.lentOut}
        atCustomerHomes={overview.atCustomerHomes}
        customerAdvance={customerAdvance}
        borrowed={overview.borrowed}
        searchSlot={<GrainNameSearch />}
        registerEdit={{ productId: product.id, productName: product.name, register }}
      />

      <GrainLedgerTabs
        ledger={ledger}
        customerBatches={customerBatches}
        unitName={unit}
        productName={product.name}
        loans={loans}
        loanOptions={loanOptions}
        homeGrain={homeGrain}
      />
    </>
  );
}
