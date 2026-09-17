import { getCashFlowForDate } from "@/modules/cash-flow/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { DayCloseForm } from "@/modules/cash-flow/components/DayCloseForm";
import { EditOpeningBalanceButton } from "@/modules/cash-flow/components/EditOpeningBalanceButton";
import { EditClosingBalanceButton } from "@/modules/cash-flow/components/EditClosingBalanceButton";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="section-label">{children}</span>;
}

// The full dashboard for one day — every metric comes from a single
// getCashFlowForDate call. Four sections: Activity (how busy the day
// was), Cash register (the opening balance plus the Expected/Actual
// closing hero pair — the two numbers a shopkeeper actually compares
// at day's end), Account & credit (informational, never affects the
// physical cash math), and Day summary (totals across every payment
// method). Adding a future metric is just: add it to
// getCashFlowForDate's return, then add one more card to whichever
// section it belongs in.
export async function CashFlowDayView({ date }: { date: string }) {
  const flow = await getCashFlowForDate(date);
  // Total revenue for the day across every payment method — distinct
  // from Expected/Actual closing, which are purely a physical-cash
  // reconciliation and deliberately exclude Account and Credit.
  const totalReceivedToday = flow.cashIn + flow.accountIn + flow.creditIn;
  // Total money that left the shop today, across every method — the
  // "daily expense" figure, parallel to totalReceivedToday.
  const totalExpenseToday = flow.cashOut + flow.accountOut + flow.creditOut;

  return (
    <div className="register-panel">
      <p className="register-date">{formatDate(date)}</p>

      <section className="cf-section">
        <SectionLabel>Activity</SectionLabel>
        <div className="activity-row">
          <div className="count-card">
            <p>Sales recorded</p>
            <p>{flow.salesCount}</p>
          </div>
          <div className="count-card">
            <p>Expenses recorded</p>
            <p>{flow.expenseCount}</p>
          </div>
        </div>
      </section>

      <section className="cf-section">
        <SectionLabel>Cash register</SectionLabel>
        <div className="opening-line">
          Opening balance <strong className="num">{formatMoney(flow.openingBalance)}</strong>
          {!flow.needsOpeningBalance && (
            <EditOpeningBalanceButton date={date} openingBalance={flow.openingBalance} />
          )}
        </div>

        <div className="hero-row">
          <div className="hero-card expected">
            <p className="hero-label">Expected closing</p>
            <p className="hero-value num">{formatMoney(flow.expectedClosing)}</p>
            <p className="hero-breakdown">{formatMoney(flow.openingBalance)} opening</p>
            <div className="hero-chip-row">
              <span className="hero-chip in">
                <span className="hero-chip-label">Cash in</span>
                <span className="hero-chip-value num">+ {formatMoney(flow.cashIn)}</span>
              </span>
              <span className="hero-chip out">
                <span className="hero-chip-label">Cash out</span>
                <span className="hero-chip-value num">− {formatMoney(flow.cashOut)}</span>
              </span>
            </div>
          </div>
          <div className="hero-card actual">
            <p className="hero-label">Actual closing</p>
            <p className="hero-value num" style={flow.actualClosing === null ? { color: "var(--ink-muted)" } : undefined}>
              {flow.actualClosing !== null ? formatMoney(flow.actualClosing) : "—"}
            </p>
            {flow.actualClosing !== null && (
              <EditClosingBalanceButton date={date} actualClosing={flow.actualClosing} />
            )}
            <DayCloseForm date={date} needsOpeningBalance={flow.needsOpeningBalance} isClosed={flow.isClosed} />
          </div>
        </div>

        {flow.variance !== null && (
          <p
            className="variance-note"
            style={{
              color:
                flow.variance === 0 ? "var(--ink-muted)" : flow.variance > 0 ? "var(--primary-600)" : "var(--consigned-600)",
            }}
          >
            {flow.variance === 0
              ? "No variance — matches exactly."
              : flow.variance > 0
                ? `Rs ${Math.abs(flow.variance).toLocaleString()} more than expected.`
                : `Rs ${Math.abs(flow.variance).toLocaleString()} short of expected.`}
          </p>
        )}
      </section>

      <section className="cf-section">
        <SectionLabel>Account &amp; credit</SectionLabel>
        <div className="visibility-panel">
          <div className="visibility-strip">
            <div className="strip-item">
              <p>Account in</p>
              <p className="num">{formatMoney(flow.accountIn)}</p>
            </div>
            <div className="strip-item">
              <p>Account out</p>
              <p className="num">{formatMoney(flow.accountOut)}</p>
            </div>
            <div className="strip-item">
              <p>Udhaar (sales)</p>
              <p className="num">{formatMoney(flow.creditIn)}</p>
            </div>
            <div className="strip-item">
              <p>Udhaar (expenses)</p>
              <p className="num">{formatMoney(flow.creditOut)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cf-section">
        <SectionLabel>Day summary</SectionLabel>
        <div className="total-row">
          <div className="total-card">
            <p>Total received today</p>
            <p className="num" style={{ color: "var(--primary-600)" }}>
              {formatMoney(totalReceivedToday)}
            </p>
          </div>
          <div className="total-card">
            <p>Total expense today</p>
            <p className="num" style={{ color: "var(--consigned-600)" }}>
              {formatMoney(totalExpenseToday)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
