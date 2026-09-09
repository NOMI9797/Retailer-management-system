import { getTodaysSalesStats } from "@/modules/daily-sales/actions";
import { getCashFlowForDate } from "@/modules/cash-flow/actions";
import { getBalanceSummary } from "@/modules/reports/actions";
import { formatMoney, toLocalDateString } from "@/lib/utils";

// Real data, queried fresh on every render — no unstable_cache
// anywhere in this file or the actions it calls, per the milestone's
// explicit "none of this should be cached" requirement (a shopkeeper
// closing a sale or the day's register expects this page to reflect
// it immediately on the next visit).
export default async function DashboardPage() {
  const today = toLocalDateString(new Date());

  const [salesStats, cashFlow, balances] = await Promise.all([
    getTodaysSalesStats(),
    getCashFlowForDate(today),
    getBalanceSummary(),
  ]);

  const cashInHand = cashFlow.isClosed && cashFlow.actualClosing !== null
    ? cashFlow.actualClosing
    : cashFlow.expectedClosing;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shop dashboard</h1>
          <p>Today&apos;s snapshot — cash, accounts, and profit at a glance.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-label">Today&apos;s sales</p>
          <p className="stat-value">{formatMoney(salesStats.totalSales)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Cash in hand</p>
          <p className="stat-value tone-primary">{formatMoney(cashInHand)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Customers owe</p>
          <p className="stat-value tone-grain">{formatMoney(balances.customersOwe)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Shop owes farmers</p>
          <p className="stat-value tone-consigned">{formatMoney(balances.shopOwesFarmers)}</p>
        </div>
      </div>
    </>
  );
}
