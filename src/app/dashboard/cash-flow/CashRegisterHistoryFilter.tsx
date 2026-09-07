"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildCashFlowHref } from "./searchParamsHref";

export function CashRegisterHistoryFilter({ activeFrom, activeTo }: { activeFrom: string; activeTo: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(patch: { historyFrom?: string; historyTo?: string }) {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildCashFlowHref(current, patch));
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
        onChange={(e) => onChange({ historyFrom: e.target.value || undefined })}
        aria-label="History from date"
      />
      <span>to</span>
      <input
        type="date"
        value={activeTo}
        min={activeFrom || undefined}
        onChange={(e) => onChange({ historyTo: e.target.value || undefined })}
        aria-label="History to date"
      />
      {(activeFrom || activeTo) && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "4px 10px", fontSize: 11.5 }}
          onClick={() => onChange({ historyFrom: undefined, historyTo: undefined })}
        >
          Clear
        </button>
      )}
    </div>
  );
}
