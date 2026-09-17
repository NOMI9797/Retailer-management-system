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
