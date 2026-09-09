import Link from "next/link";
import { listDailyPnlHistory } from "@/modules/reports/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import type { ReportsHistorySearchParams } from "./searchParamsHref";

// Every row links through to that day's full Daily report
// (/dashboard/reports?tab=daily&date=...) — same "scannable ledger,
// click a row for the detail view" shape as Register History's table.
export async function ReportsHistoryTable({ searchParams }: { searchParams: ReportsHistorySearchParams }) {
  const entries = await listDailyPnlHistory({
    fromDate: searchParams.from,
    toDate: searchParams.to,
  });

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th style={{ textAlign: "right" }}>Revenue</th>
            <th style={{ textAlign: "right" }}>Cost of goods</th>
            <th style={{ textAlign: "right" }}>Gross profit</th>
            <th style={{ textAlign: "right" }}>Expenses</th>
            <th style={{ textAlign: "right" }}>Net profit</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={6}>No sales or expenses recorded yet.</td>
            </tr>
          ) : (
            entries.map((entry) => (
              <tr key={entry.date} className="clickable-row" style={{ position: "relative" }}>
                <td>
                  {/* Stretched link covering the whole row, same
                      pattern as RegisterHistoryTable — clicking
                      anywhere on the row navigates, not just the
                      date cell's text. */}
                  <Link
                    href={`/dashboard/reports?tab=daily&date=${entry.date}`}
                    style={{ position: "absolute", inset: 0 }}
                    aria-label={`View report for ${formatDate(entry.date)}`}
                  />
                  {formatDate(entry.date)}
                  {entry.hasUnknownCost && <span className="variance-warn-note">cost data unavailable</span>}
                </td>
                <td style={{ textAlign: "right" }}>{formatMoney(entry.revenue)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(entry.cogs)}</td>
                <td style={{ textAlign: "right", color: "var(--primary-600)", fontWeight: 600 }}>
                  {formatMoney(entry.grossProfit)}
                </td>
                <td style={{ textAlign: "right" }}>{formatMoney(entry.expenses)}</td>
                <td
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    color: entry.netProfit >= 0 ? "var(--primary-600)" : "var(--consigned-600)",
                  }}
                >
                  {formatMoney(entry.netProfit)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
