import { getPnlReport } from "@/modules/reports/actions";
import { formatMoney } from "@/lib/utils";
import type { ReportPeriodInput } from "@/modules/reports/schema";

// Pure aggregation, no caching — every render re-queries, per the
// milestone's "nothing cached" requirement (stated for the Dashboard,
// applied here too since a shopkeeper closing out a day expects the
// same-day report to reflect it immediately).
export async function PnlReportPanel({ period }: { period: ReportPeriodInput }) {
  const report = await getPnlReport(period);

  return (
    <div>
      {report.hasUnknownCost && (
        <p className="variance-note" style={{ color: "var(--consigned-600)" }}>
          Cost data unavailable for one or more sales in this period (recorded before cost tracking was
          added) — cost of goods sold and profit below are understated for those items.
        </p>
      )}

      <div className="stat-grid products-stat-grid">
        <div className="stat-card">
          <p className="stat-label">Revenue</p>
          <p className="stat-value">{formatMoney(report.revenue)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Cost of goods sold</p>
          <p className="stat-value tone-grain">{formatMoney(report.cogs)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Gross profit</p>
          <p className="stat-value tone-primary">{formatMoney(report.grossProfit)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Expenses</p>
          <p className="stat-value tone-consigned">{formatMoney(report.expenses)}</p>
        </div>
      </div>

      <div className="stat-grid" style={{ marginTop: 12, gridTemplateColumns: "1fr" }}>
        <div className="stat-card">
          <p className="stat-label">Net profit</p>
          <p
            className="stat-value"
            style={{ fontSize: 28, color: report.netProfit >= 0 ? "var(--primary-600)" : "var(--consigned-600)" }}
          >
            {formatMoney(report.netProfit)}
          </p>
        </div>
      </div>
    </div>
  );
}
