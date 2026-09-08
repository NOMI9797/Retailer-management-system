import Link from "next/link";
import { listCashRegisterHistory } from "@/modules/cash-flow/actions";
import { formatMoney, formatDate, toLocalDateString } from "@/lib/utils";
import type { RegisterHistorySearchParams } from "./searchParamsHref";

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

// Every row links through to that day's full Cash Flow dashboard
// (/dashboard/cash-flow?date=...) — this table is a scannable ledger
// of past days, not where a day's numbers get edited.
export async function RegisterHistoryTable({ searchParams }: { searchParams: RegisterHistorySearchParams }) {
  const entries = await listCashRegisterHistory({
    fromDate: searchParams.from,
    toDate: searchParams.to,
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
              const dateParam = toLocalDateString(entry.date);
              return (
                <tr key={entry.id} className="clickable-row" style={{ position: "relative" }}>
                  <td>
                    {/* Stretched link — covers the entire row's clickable
                        area (via position:absolute + inset:0 relative to
                        the <tr>) while only the date text is visible,
                        so clicking anywhere on the row navigates, not
                        just the date cell's text itself. */}
                    <Link
                      href={`/dashboard/cash-flow?date=${dateParam}`}
                      style={{ position: "absolute", inset: 0 }}
                      aria-label={`View Cash Flow for ${formatDate(entry.date)}`}
                    />
                    {formatDate(entry.date)}
                  </td>
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
