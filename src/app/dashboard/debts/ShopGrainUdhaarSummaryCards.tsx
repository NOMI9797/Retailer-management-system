import { getShopGrainUdhaarSummary } from "@/modules/stock/actions";
import { formatMoney } from "@/lib/utils";

// Same "stat cards above a table" shape as ShopUdhaarSummaryCards,
// scoped to money the shop itself owes customers for grain bought on
// Credit (see listShopGrainUdhaar) instead of unpaid expenses.
export async function ShopGrainUdhaarSummaryCards({ productId }: { productId?: string } = {}) {
  const summary = await getShopGrainUdhaarSummary(productId);

  return (
    <div className="stat-grid customers-stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">Total owed to customers</p>
        <p className="stat-value tone-consigned">{formatMoney(summary.totalRemaining)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Total paid so far</p>
        <p className="stat-value tone-primary">{formatMoney(summary.totalPaid)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Customers owed</p>
        <p className="stat-value">{summary.customerCount}</p>
      </div>
    </div>
  );
}
