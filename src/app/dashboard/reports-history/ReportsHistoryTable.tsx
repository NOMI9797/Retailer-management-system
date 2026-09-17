import Link from "next/link";
import { listDailyPnlHistory } from "@/modules/reports/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import type { ReportsHistorySearchParams } from "./searchParamsHref";

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

// Same table shape as Register History's redesign: a trailing "View"
// button rather than a stretched whole-row link, and Net profit shown
// as an up/down chip (green surplus, coral loss) instead of plain
// colored text, so profit vs. loss reads at a glance across the list.
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={7}>No sales or expenses recorded yet.</td>
            </tr>
          ) : (
            entries.map((entry) => {
              const isLoss = entry.netProfit < 0;
              return (
                <tr key={entry.date} className={isLoss ? "is-open" : undefined}>
                  <td>
                    {formatDate(entry.date)}
                    {entry.hasUnknownCost && <span className="variance-warn-note">cost data unavailable</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(entry.revenue)}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(entry.cogs)}
                  </td>
                  <td className="num" style={{ textAlign: "right", color: "var(--primary-600)", fontWeight: 600 }}>
                    {formatMoney(entry.grossProfit)}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(entry.expenses)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`var-chip num ${isLoss ? "down" : "profit"}`}>
                      {isLoss ? <DownArrow /> : <UpArrow />}
                      {isLoss ? "−" : "+"}
                      {formatMoney(Math.abs(entry.netProfit))}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/dashboard/reports?tab=daily&date=${entry.date}`} className="row-link">
                      View
                    </Link>
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
