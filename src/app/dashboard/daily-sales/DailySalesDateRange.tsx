"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildDailySalesHref } from "./searchParamsHref";

// From/to date filter — same URL-driven pattern as the area/account
// type selects, reading the URL itself since a function can't cross
// the Server -> Client boundary as a prop. Each input commits on
// change so picking a date immediately re-filters, no separate
// "apply" step.
export function DailySalesDateRange({ activeFrom, activeTo }: { activeFrom: string; activeTo: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(patch: { from?: string; to?: string }) {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildDailySalesHref(current, { ...patch, page: undefined }));
  }

  return (
    <div className="date-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </svg>
      <input
        type="date"
        value={activeFrom}
        max={activeTo || undefined}
        onChange={(e) => onChange({ from: e.target.value || undefined })}
        aria-label="From date"
      />
      <span>to</span>
      <input
        type="date"
        value={activeTo}
        min={activeFrom || undefined}
        onChange={(e) => onChange({ to: e.target.value || undefined })}
        aria-label="To date"
      />
      {(activeFrom || activeTo) && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "4px 10px", fontSize: 11.5 }}
          onClick={() => onChange({ from: undefined, to: undefined })}
        >
          Clear
        </button>
      )}
    </div>
  );
}
