"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildReportsHref, type ReportsSearchParams } from "./searchParamsHref";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// One picker component covering all four tabs — the specific control
// shown (date input / month+year selects / year select / season
// select) depends on which tab is active, same "one component swaps
// its content per tab" shape as ExpensesHeader's Add button.
export function ReportsPeriodPicker({
  tab,
  searchParams,
  seasons,
  today,
}: {
  tab: "daily" | "monthly" | "yearly" | "seasonal";
  searchParams: ReportsSearchParams;
  seasons: string[];
  today: string;
}) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();

  function onChange(patch: Partial<ReportsSearchParams>) {
    const current = Object.fromEntries(urlSearchParams.entries());
    router.push(buildReportsHref(current, patch));
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  if (tab === "daily") {
    return (
      <div className="date-pill">
        <svg className="icon" viewBox="0 0 24 24">
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
        <input
          type="date"
          value={searchParams.date || today}
          max={today}
          onChange={(e) => onChange({ date: e.target.value || undefined })}
          aria-label="Report date"
        />
      </div>
    );
  }

  if (tab === "monthly") {
    return (
      <div className="date-pill">
        <select
          value={Number(searchParams.month) || new Date().getMonth() + 1}
          onChange={(e) => onChange({ month: e.target.value })}
          aria-label="Month"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={Number(searchParams.year) || currentYear}
          onChange={(e) => onChange({ year: e.target.value })}
          aria-label="Year"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (tab === "yearly") {
    return (
      <div className="date-pill">
        <select
          value={Number(searchParams.year) || currentYear}
          onChange={(e) => onChange({ year: e.target.value })}
          aria-label="Year"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Seasonal — no season management UI this milestone, so the
  // dropdown lists whatever distinct DailySale.season values already
  // exist rather than a managed list.
  if (seasons.length === 0) {
    return <p className="empty-note">No seasons recorded on any sale yet.</p>;
  }

  return (
    <div className="date-pill">
      <select
        value={searchParams.season || seasons[0]}
        onChange={(e) => onChange({ season: e.target.value })}
        aria-label="Season"
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
