import { getCashFlowForDate } from "@/modules/cash-flow/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { DayCloseForm } from "@/modules/cash-flow/components/DayCloseForm";
import { EditOpeningBalanceButton } from "@/modules/cash-flow/components/EditOpeningBalanceButton";
import { EditClosingBalanceButton } from "@/modules/cash-flow/components/EditClosingBalanceButton";

export async function CashFlowDayView({ date }: { date: string }) {
  const flow = await getCashFlowForDate(date);
  // Total revenue for the day across every payment method — distinct
  // from Expected/Actual closing, which are purely a physical-cash
  // reconciliation and deliberately exclude Account and Credit. This
  // is "how much did the shop take in today," not "how much cash
  // should be in the drawer."
  const totalReceivedToday = flow.cashIn + flow.accountIn + flow.creditIn;

  return (
    <div className="register-panel">
      <p className="register-date">{formatDate(date)}</p>

      <div className="stat-grid cash-flow-stat-grid" style={{ marginBottom: 4 }}>
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
          style={{
            fontSize: 13,
            marginTop: 10,
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

      <div className="visibility-panel">
        <div className="visibility-header">
          <svg className="icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          Account &amp; credit — shown for visibility only, not counted in the cash register above
        </div>
        <div className="visibility-strip">
          <div className="strip-item">
            <p>Account in</p>
            <p>{formatMoney(flow.accountIn)}</p>
          </div>
          <div className="strip-item">
            <p>Account out</p>
            <p>{formatMoney(flow.accountOut)}</p>
          </div>
          <div className="strip-item">
            <p>Credit (sales)</p>
            <p>{formatMoney(flow.creditIn)}</p>
          </div>
          <div className="strip-item">
            <p>Credit (expenses)</p>
            <p>{formatMoney(flow.creditOut)}</p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
          paddingTop: 14,
          borderTop: "0.5px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>
          Total received today (Cash + Account + Credit)
        </span>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{formatMoney(totalReceivedToday)}</span>
      </div>
    </div>
  );
}
