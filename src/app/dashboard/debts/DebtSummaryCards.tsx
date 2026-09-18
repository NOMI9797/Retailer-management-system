import { getDebtSummary } from "@/modules/debts/actions";
import { formatMoney } from "@/lib/utils";
import type { DebtBucket } from "@/modules/debts/schema";

export async function DebtSummaryCards({ bucket }: { bucket: DebtBucket }) {
  const summary = await getDebtSummary(bucket);

  return (
    <div className="stat-grid customers-stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">{bucket === "LONG_TERM" ? "Total long-term loans" : "Total loans (Udhaar)"}</p>
        <p className="stat-value tone-grain">{formatMoney(summary.totalLoans)}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Total repaid so far</p>
        <p className="stat-value tone-primary">{formatMoney(summary.totalPaidOverall)}</p>
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
