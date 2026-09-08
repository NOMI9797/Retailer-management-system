import { getCashFlowForDate } from "@/modules/cash-flow/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { DayCloseForm } from "@/modules/cash-flow/components/DayCloseForm";
import { EditOpeningBalanceButton } from "@/modules/cash-flow/components/EditOpeningBalanceButton";
import { EditClosingBalanceButton } from "@/modules/cash-flow/components/EditClosingBalanceButton";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="metric-section-label">{children}</p>;
}

// The full dashboard for one day — every metric comes from a single
// getCashFlowForDate call, grouped into categories that each answer a
// different question (how busy was the day / does physical cash match
// the books / what other money moved / the day's overall totals), but
// every card everywhere is the same consistent size. Adding a future
// metric is just: add it to getCashFlowForDate's return, then add one
// more card to whichever category section it belongs in.
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

      <SectionLabel>Activity</SectionLabel>
      <div className="stat-grid cash-flow-stat-grid">
        <div className="stat-card">
          <p className="stat-label">Sales recorded</p>
          <p className="stat-value">{flow.salesCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Expenses recorded</p>
          <p className="stat-value">{flow.expenseCount}</p>
        </div>
      </div>

      <SectionLabel>Cash register</SectionLabel>
      <div className="stat-grid cash-flow-stat-grid">
        <div className="stat-card">
          <p className="stat-label">Opening balance</p>
          <p className="stat-value">{formatMoney(flow.openingBalance)}</p>
          {!flow.needsOpeningBalance && (
            <EditOpeningBalanceButton date={date} openingBalance={flow.openingBalance} />
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">Cash in</p>
          <p className="stat-value tone-primary">{formatMoney(flow.cashIn)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Cash out</p>
          <p className="stat-value tone-consigned">{formatMoney(flow.cashOut)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Expected closing</p>
          <p className="stat-value">{formatMoney(flow.expectedClosing)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Actual closing</p>
          <p className="stat-value">{flow.actualClosing !== null ? formatMoney(flow.actualClosing) : "—"}</p>
          {flow.actualClosing !== null && (
            <EditClosingBalanceButton date={date} actualClosing={flow.actualClosing} />
          )}
        </div>
      </div>

      {flow.variance !== null && (
        <p
          className="variance-note"
          style={{
            color: flow.variance === 0 ? "var(--ink-muted)" : flow.variance > 0 ? "var(--primary-600)" : "var(--consigned-600)",
          }}
        >
          {flow.variance === 0
            ? "No variance — matches exactly."
            : flow.variance > 0
              ? `Rs ${Math.abs(flow.variance).toLocaleString()} more than expected.`
              : `Rs ${Math.abs(flow.variance).toLocaleString()} short of expected.`}
        </p>
      )}

      <DayCloseForm date={date} needsOpeningBalance={flow.needsOpeningBalance} isClosed={flow.isClosed} />

      <SectionLabel>Account &amp; credit</SectionLabel>
      <div className="stat-grid cash-flow-stat-grid">
        <div className="stat-card">
          <p className="stat-label">Account in</p>
          <p className="stat-value tone-grain">{formatMoney(flow.accountIn)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Account out</p>
          <p className="stat-value tone-grain">{formatMoney(flow.accountOut)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Credit (sales)</p>
          <p className="stat-value tone-consigned">{formatMoney(flow.creditIn)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Credit (expenses)</p>
          <p className="stat-value tone-consigned">{formatMoney(flow.creditOut)}</p>
        </div>
      </div>

      <SectionLabel>Day summary</SectionLabel>
      <div className="stat-grid cash-flow-stat-grid">
        <div className="stat-card">
          <p className="stat-label">Total received today</p>
          <p className="stat-value">{formatMoney(totalReceivedToday)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total expense today</p>
          <p className="stat-value">{formatMoney(totalExpenseToday)}</p>
        </div>
      </div>
    </div>
  );
}
