import { getDealerBalances } from "@/modules/dealers/actions";
import { formatMoney } from "@/lib/utils";

// Same "stat cards above a table" shape as ShopGrainUdhaarSummaryCards,
// scoped to money the shop owes dealers (Products + Grain combined)
// instead of customers.
export async function ShopDealerUdhaarSummaryCards() {
  const [productsDealers, grainDealers] = await Promise.all([
    getDealerBalances("PRODUCTS"),
    getDealerBalances("GRAIN"),
  ]);

  const owedDealers = [...productsDealers, ...grainDealers].filter((d) => d.currentBalance > 0);
  const totalOwed = owedDealers.reduce((sum, d) => sum + d.currentBalance, 0);

  return (
    <div className="stat-grid customers-stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">Total owed to dealers</p>
        <p className="stat-value tone-consigned">{formatMoney(totalOwed)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Dealers owed</p>
        <p className="stat-value">{owedDealers.length}</p>
      </div>
    </div>
  );
}
