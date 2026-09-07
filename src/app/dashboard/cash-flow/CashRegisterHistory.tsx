import { listCashRegisterHistory } from "@/modules/cash-flow/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import type { CashFlowSearchParams } from "./searchParamsHref";

// A variance this large relative to the expected closing is far more
// likely to be a data-entry mistake (e.g. an expense logged twice, or
// the wrong day picked when closing) than a genuine cash surplus/
// shortage — flagged as a hint to double-check, not blocked.
const SUSPICIOUS_VARIANCE_RATIO = 0.5;

function isSuspiciousVariance(variance: number, expectedClosing: number) {
  if (variance === 0) return false;
  const threshold = Math.max(Math.abs(expectedClosing) * SUSPICIOUS_VARIANCE_RATIO, 1000);
  return Math.abs(variance) >= threshold;
}

export async function CashRegisterHistory({ searchParams }: { searchParams: CashFlowSearchParams }) {
  const entries = await listCashRegisterHistory({
    fromDate: searchParams.historyFrom,
    toDate: searchParams.historyTo,
  });

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th style={{ textAlign: "right" }}>Opening</th>
            <th style={{ textAlign: "right" }}>Expected closing</th>
            <th style={{ textAlign: "right" }}>Actual closing</th>
            <th style={{ textAlign: "right" }}>Variance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={6}>No register entries yet.</td>
            </tr>
          ) : (
            entries.map((entry) => {
              const suspicious =
                entry.variance !== null && isSuspiciousVariance(entry.variance, entry.expectedClosing);
              return (
                <tr key={entry.id}>
                  <td>{formatDate(entry.date)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(entry.openingBalance)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(entry.expectedClosing)}</td>
                  <td style={{ textAlign: "right" }}>
                    {entry.actualClosing !== null ? formatMoney(entry.actualClosing) : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span
                      className={suspicious ? "variance-bad" : undefined}
                      style={
                        suspicious
                          ? undefined
                          : {
                              color:
                                entry.variance === null || entry.variance === 0
                                  ? "var(--ink-muted)"
                                  : entry.variance > 0
                                    ? "var(--primary-600)"
                                    : "var(--consigned-600)",
                              fontWeight: 600,
                            }
                      }
                    >
                      {entry.variance !== null
                        ? `${entry.variance > 0 ? "+" : ""}${formatMoney(entry.variance)}`
                        : "—"}
                    </span>
                    {suspicious && <span className="variance-warn-note">check this entry</span>}
                  </td>
                  <td>
                    <span className={`status-badge${entry.closedAt ? "" : " inactive"}`}>
                      {entry.closedAt ? "Closed" : "Open"}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
