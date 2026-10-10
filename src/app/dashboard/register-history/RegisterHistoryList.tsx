"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteCashRegisterEntry, type listCashRegisterHistory } from "@/modules/cash-flow/actions";
import { formatMoney, formatDate, toLocalDateString } from "@/lib/utils";
import { showToast } from "@/components/shared/toastStore";

type Entries = Awaited<ReturnType<typeof listCashRegisterHistory>>;

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

function UpArrow() {
  return (
    <svg className="icon" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

function DownArrow() {
  return (
    <svg className="icon" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg
      className="flag-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>Unusually large variance</title>
      <path d="M12 9v4M12 17h.01M10.3 3.9L2.7 17.5A1.9 1.9 0 004.4 20.5h15.2a1.9 1.9 0 001.7-3L13.7 3.9a1.9 1.9 0 00-3.4 0z" />
    </svg>
  );
}

// Client leaf for the Register History table — same split pattern
// SalesHistoryTable/SalesHistoryList follows elsewhere. Every row
// still links through to that day's full Cash Flow dashboard, where
// Edit already lives (EditOpeningBalanceButton/
// EditClosingBalanceButton) — Delete is the new piece here, removing
// the day's register entry outright and re-deriving every later day's
// opening/expected/variance from whatever closing now exists before
// it (see deleteCashRegisterEntry's comment).
export function RegisterHistoryList({ entries }: { entries: Entries }) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(dateParam: string, id: string) {
    setIsDeleting(true);
    try {
      const result = await deleteCashRegisterEntry(dateParam);
      if (!result.success) {
        showToast(result.error, "error");
        setConfirmingId(null);
        return;
      }
      showToast("Register entry deleted");
      setConfirmingId(null);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={7}>No register entries yet.</td>
            </tr>
          ) : (
            entries.map((entry) => {
              const suspicious =
                entry.variance !== null && isSuspiciousVariance(entry.variance, entry.expectedClosing);
              const dateParam = toLocalDateString(entry.date);
              const isOpen = !entry.closedAt;

              return (
                <tr key={entry.id} className={isOpen ? "is-open" : undefined}>
                  <td>{formatDate(entry.date)}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(entry.openingBalance)}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(entry.expectedClosing)}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {entry.actualClosing !== null ? formatMoney(entry.actualClosing) : <span className="dash">—</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {entry.variance !== null ? (
                      <>
                        <span className={`var-chip num ${entry.variance < 0 ? "down" : "up"}`}>
                          {entry.variance < 0 ? <DownArrow /> : <UpArrow />}
                          {entry.variance > 0 ? "+" : entry.variance < 0 ? "−" : ""}
                          {formatMoney(Math.abs(entry.variance))}
                        </span>
                        {suspicious && <FlagIcon />}
                      </>
                    ) : (
                      <span className="dash">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${isOpen ? "status-open" : "status-closed"}`}>
                      {isOpen ? "Open" : "Closed"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {confirmingId === entry.id ? (
                      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleDelete(dateParam, entry.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => setConfirmingId(null)}
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                        <Link
                          href={`/dashboard/cash-flow?date=${dateParam}`}
                          className={`row-link${isOpen ? " attention" : ""}`}
                        >
                          {isOpen ? "Close day" : "View"}
                        </Link>
                        <button className="icon-btn" onClick={() => setConfirmingId(entry.id)} title="Delete">
                          <svg className="icon" viewBox="0 0 24 24">
                            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
                          </svg>
                        </button>
                      </div>
                    )}
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
