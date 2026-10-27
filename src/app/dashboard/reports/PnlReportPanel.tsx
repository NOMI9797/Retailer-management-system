import { getPnlReport } from "@/modules/reports/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import type { ReportPeriodInput } from "@/modules/reports/schema";

function periodLabel(period: ReportPeriodInput): string {
  if (period.view === "daily") return formatDate(period.date);
  if (period.view === "monthly") return `${period.month}/${period.year}`;
  if (period.view === "yearly") return String(period.year);
  return period.season;
}

// Pure aggregation, no caching — every render re-queries, per the
// milestone's "nothing cached" requirement (stated for the Dashboard,
// applied here too since a shopkeeper closing out a day expects the
// same-day report to reflect it immediately).
export async function PnlReportPanel({ period }: { period: ReportPeriodInput }) {
  const report = await getPnlReport(period);
  const isEmpty = report.revenue === 0 && report.cogs === 0 && report.expenses === 0;
  const isNegative = report.netProfit < 0;

  return (
    <div>
      {report.hasUnknownCost && (
        <p className="variance-note" style={{ color: "var(--consigned-600)" }}>
          Cost data unavailable for one or more sales in this period (recorded before cost tracking was
          added) — cost of goods sold and profit below are understated for those items.
        </p>
      )}

      {/* The calculation chain — Revenue − COGS = Gross profit −
          Expenses, read left to right as one continuous formula
          rather than four disconnected cards. */}
      <div className="chain">
        <div className="chain-card">
          <p>Revenue</p>
          <p className="v-neutral num">{formatMoney(report.revenue)}</p>
        </div>
        <div className="chain-op">−</div>
        <div className="chain-card">
          <p>Cost of goods sold</p>
          <p className="v-cost num">{formatMoney(report.cogs)}</p>
        </div>
        <div className="chain-op">=</div>
        <div className="chain-card subtotal">
          <p>Gross profit</p>
          <p className="v-good num">{formatMoney(report.grossProfit)}</p>
        </div>
        <div className="chain-op">−</div>
        <div className="chain-card">
          <p>Expenses</p>
          <p className="v-cost num">{formatMoney(report.expenses)}</p>
        </div>
      </div>

      {/* Where Revenue and Cost come from: products by what each unit
          cost; grain by its running account (money received for grain
          less money paid for it in these dates — see Grain → Profit /
          Loss for each grain's season). */}
      <div className="panel" style={{ padding: "12px 16px", margin: "0 0 16px", fontSize: 13.5 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Products:</strong> sold {formatMoney(report.productRevenue)} − cost{" "}
          {formatMoney(report.productCogs)} ={" "}
          <strong>{formatMoney(report.productRevenue - report.productCogs)}</strong>
        </p>
        {report.grainNotInSeasonal ? (
          <p style={{ margin: 0, color: "var(--ink-muted)" }}>
            <strong>Grain:</strong> not in this view — see each grain&apos;s season on Grain → Profit / Loss.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            <strong>Grain:</strong> sold {formatMoney(report.grainReceived)} − cost of that grain{" "}
            {formatMoney(report.grainPaid)} ={" "}
            <strong style={{ color: report.grainReceived - report.grainPaid >= 0 ? "var(--primary-600)" : "var(--consigned-600)" }}>
              {report.grainReceived - report.grainPaid >= 0 ? "▲" : "▼"}{" "}
              {formatMoney(Math.abs(report.grainReceived - report.grainPaid))}
            </strong>{" "}
            <span style={{ color: "var(--ink-muted)" }}>(customer grain not yet bought has no cost yet)</span>
          </p>
        )}
      </div>

      <div className={`hero-net${isNegative ? " negative" : ""}`}>
        <p className="hero-net-label">
          Net profit <span className="hero-net-formula">— gross profit minus expenses</span>
        </p>
        <p className={`hero-net-value num${isNegative ? " negative" : ""}`}>{formatMoney(report.netProfit)}</p>
        {isEmpty && <p className="hero-net-sub">No sales or expenses recorded for {periodLabel(period)} yet.</p>}
      </div>
    </div>
  );
}
