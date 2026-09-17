import { getDebtSummary } from "@/modules/debts/actions";
import { formatMoney } from "@/lib/utils";

export async function DebtSummaryCards() {
  const summary = await getDebtSummary();

  return (
    <div className="stat-grid customers-stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">Total loans (Udhar)</p>
        <p className="stat-value tone-grain">{formatMoney(summary.totalLoans)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Total on-account</p>
        <p className="stat-value tone-primary">{formatMoney(summary.totalOnAccount)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Grand total owed</p>
        <p className="stat-value">{formatMoney(summary.grandTotal)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Overdue accounts</p>
        <p className="stat-value" style={{ color: summary.overdueCount > 0 ? "var(--consigned-600)" : undefined }}>
          {summary.overdueCount} of {summary.debtorCount}
        </p>
      </div>
    </div>
  );
}
