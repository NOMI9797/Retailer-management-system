import { getShopExpenseUdhaarSummary } from "@/modules/expenses/actions";
import { formatMoney } from "@/lib/utils";

// Same "stat cards above a table" shape as DebtSummaryCards, scoped
// to unpaid Daily/Monthly expenses (the shop's own debt) instead of
// customer accounts.
export async function ShopUdhaarSummaryCards() {
  const summary = await getShopExpenseUdhaarSummary();

  return (
    <div className="stat-grid customers-stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">Total Daily/Monthly Udhaar</p>
        <p className="stat-value tone-grain">{formatMoney(summary.totalBorrowed)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Total paid so far</p>
        <p className="stat-value tone-primary">{formatMoney(summary.totalPaid)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Grand total owed</p>
        <p className="stat-value">{formatMoney(summary.totalRemaining)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Unpaid expenses</p>
        <p className="stat-value">{summary.count}</p>
      </div>
    </div>
  );
}
