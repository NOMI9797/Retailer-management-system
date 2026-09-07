"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildCashFlowHref } from "./searchParamsHref";

export function CashFlowDatePicker({ activeDate }: { activeDate: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(date: string) {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildCashFlowHref(current, { date }));
  }

  return (
    <div className="date-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </svg>
      <input type="date" value={activeDate} onChange={(e) => onChange(e.target.value)} aria-label="Register date" />
    </div>
  );
}
