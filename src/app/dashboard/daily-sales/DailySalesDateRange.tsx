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
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="date"
        value={activeFrom}
        max={activeTo || undefined}
        onChange={(e) => onChange({ from: e.target.value || undefined })}
        aria-label="From date"
      />
      <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>to</span>
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
          onClick={() => onChange({ from: undefined, to: undefined })}
        >
          Clear
        </button>
      )}
    </div>
  );
}
