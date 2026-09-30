import { getShopBorrowedSummary } from "@/modules/customers/actions";
import { formatMoney } from "@/lib/utils";

// Same "stat cards above a table" shape as DebtSummaryCards/
// ShopUdhaarSummaryCards, scoped to money the shop itself borrowed
// from customers.
export async function BorrowedFromCustomersSummaryCards() {
  const summary = await getShopBorrowedSummary();

  return (
    <div className="stat-grid customers-stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">Total borrowed</p>
        <p className="stat-value tone-grain">{formatMoney(summary.totalBorrowed)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Total repaid so far</p>
        <p className="stat-value tone-primary">{formatMoney(summary.totalPaid)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Grand total owed</p>
        <p className="stat-value">{formatMoney(summary.totalOwed)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Overdue accounts</p>
        <p className="stat-value" style={{ color: summary.overdueCount > 0 ? "var(--consigned-600)" : undefined }}>
          {summary.overdueCount} of {summary.count}
        </p>
      </div>
    </div>
  );
}
