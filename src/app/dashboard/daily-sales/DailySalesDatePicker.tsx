"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildDailySalesHref } from "./searchParamsHref";

// Which single day the page shows — URL-driven like the area/account
// type selects, committing on change so picking a date re-filters
// immediately. No date in the URL means today; the "Today" button to
// get back appears only when another day is picked.
export function DailySalesDatePicker({ activeDate, isToday }: { activeDate: string; isToday: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(date: string | undefined) {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildDailySalesHref(current, { date }));
  }

  return (
    <div className="date-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </svg>
      <input
        type="date"
        value={activeDate}
        onChange={(e) => onChange(e.target.value || undefined)}
        aria-label="Date"
      />
      {!isToday && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "4px 10px", fontSize: 11.5 }}
          onClick={() => onChange(undefined)}
        >
          Today
        </button>
      )}
    </div>
  );
}
