import { getTodaysSalesStats } from "@/modules/daily-sales/actions";
import { formatMoney } from "@/lib/utils";

// Today's snapshot — always "today," regardless of whatever the
// filters below are currently narrowing the table to, so the
// shopkeeper has a stable end-of-day reference point.
export async function DailySalesStatRow() {
  const stats = await getTodaysSalesStats();

  return (
    <div className="stat-grid daily-sales-stat-grid" style={{ marginBottom: 24 }}>
      <div className="stat-card">
        <p className="stat-label">Today&apos;s sales</p>
        <p className="stat-value">{formatMoney(stats.totalSales)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">No. of sales</p>
        <p className="stat-value">{stats.transactionCount}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Cash sales</p>
        <p className="stat-value tone-primary">{formatMoney(stats.cash)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">On account</p>
        <p className="stat-value tone-grain">{formatMoney(stats.account)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Credit</p>
        <p className="stat-value tone-consigned">{formatMoney(stats.credit)}</p>
      </div>
    </div>
  );
}
