"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildCashFlowHref, shiftDate, todayDateString } from "./searchParamsHref";

const PERIODS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
] as const;

// ◀ date ▶ and Day / Week / Month — the Cash flow page's only controls.
// Real navigation (?date / ?period), so the server renders each view.
export function CashFlowDatePicker({ activeDate, period }: { activeDate: string; period: string }) {
  const router = useRouter();
  const current = { date: activeDate, period };
  const today = todayDateString();

  return (
    <div className="cf-controls">
      <div className="cf-date-nav">
        <Link className="icon-btn" href={buildCashFlowHref(current, { date: shiftDate(activeDate, period, -1) })} title="Previous">
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="date-pill">
          <input
            type="date"
            value={activeDate}
            onChange={(e) => e.target.value && router.push(buildCashFlowHref(current, { date: e.target.value }))}
            aria-label="Date"
          />
        </div>
        <Link className="icon-btn" href={buildCashFlowHref(current, { date: shiftDate(activeDate, period, 1) })} title="Next">
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
        {activeDate !== today && (
          <Link className="btn btn-ghost" href={buildCashFlowHref(current, { date: today })}>
            Today
          </Link>
        )}
      </div>
      <div className="stock-toggle cf-period">
        {PERIODS.map((p) => (
          <Link key={p.key} href={buildCashFlowHref(current, { period: p.key })} className={period === p.key ? "active" : ""}>
            {p.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
