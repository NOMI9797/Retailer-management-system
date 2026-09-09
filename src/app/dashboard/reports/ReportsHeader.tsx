import Link from "next/link";
import { buildReportsHref } from "./searchParamsHref";

// Same tab pattern as Products/Expenses/Register history — real
// navigation via <Link> changing ?tab=, resetting the other tabs'
// period params so switching views never carries over a stale date.
export function ReportsHeader({ tab }: { tab: "daily" | "monthly" | "yearly" | "seasonal" }) {
  const tabs: { key: typeof tab; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
    { key: "seasonal", label: "Seasonal" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Profit/Loss</h1>
          <p>Revenue, cost of goods sold, and profit — for any day, month, year, or season.</p>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            href={buildReportsHref(
              {},
              { tab: t.key, date: undefined, year: undefined, month: undefined, season: undefined }
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </>
  );
}
