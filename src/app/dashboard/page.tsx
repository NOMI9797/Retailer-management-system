import { getTodaysSalesStats } from "@/modules/daily-sales/actions";
import { getCashFlowForDate } from "@/modules/cash-flow/actions";
import { getBalanceSummary } from "@/modules/reports/actions";
import { getShopOwedForGrain } from "@/modules/stock/actions";
import { formatMoney, toLocalDateString } from "@/lib/utils";

// Real data, queried fresh on every render — no unstable_cache
// anywhere in this file or the actions it calls, per the milestone's
// explicit "none of this should be cached" requirement (a shopkeeper
// closing a sale or the day's register expects this page to reflect
// it immediately on the next visit).
export default async function DashboardPage() {
  const today = toLocalDateString(new Date());

  const [salesStats, cashFlow, balances, grainOwedEntries] = await Promise.all([
    getTodaysSalesStats(),
    getCashFlowForDate(today),
    getBalanceSummary(),
    // Shop-wide, across every grain product combined — the single
    // "how much do I owe in total for settled grain" headline. Each
    // product's OWN figure lives on that product's Grain tab instead
    // (see GrainStockList.tsx), never shown per-product here.
    getShopOwedForGrain(),
  ]);
  const totalOwedForGrain = grainOwedEntries.reduce((sum, e) => sum + e.amountOwed, 0);

  const cashInHand = cashFlow.isClosed && cashFlow.actualClosing !== null
    ? cashFlow.actualClosing
    : cashFlow.expectedClosing;

  return (
    <>
      {/* Temporary — verifies staging deploys independently of
          production and that promoting to production actually ships
          this there too. Remove this whole block once confirmed. */}
      <div
        style={{
          background: "#fef3c7",
          border: "2px solid #f59e0b",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          fontWeight: 700,
          fontSize: 16,
          color: "#92400e",
          textAlign: "center",
        }}
      >
        🧪 PIPELINE TEST BUTTON — if you see this, this deployment includes the test commit
      </div>

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
        {totalOwedForGrain > 0 && (
          <div className="stat-card">
            <p className="stat-label">Owed to customers (Grain)</p>
            <p className="stat-value tone-consigned">{formatMoney(totalOwedForGrain)}</p>
          </div>
        )}
      </div>
    </>
  );
}
