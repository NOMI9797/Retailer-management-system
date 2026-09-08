import Link from "next/link";
import { buildRegisterHistoryHref, type RegisterHistorySearchParams } from "./searchParamsHref";

// Same tab pattern as Products' Simple/Grain stock and Expenses'
// Daily/Monthly — real navigation via <Link> changing ?tab=. The
// Monthly tab is UI-only for now (see MonthlyRegisterPlaceholder) —
// no data wiring, per the "just UI for now" decision; Cash Flow
// doesn't have a monthly-level register concept yet.
export function RegisterHistoryHeader({ searchParams }: { searchParams: RegisterHistorySearchParams }) {
  const tab = searchParams.tab === "monthly" ? "monthly" : "daily";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Register history</h1>
          <p>Every past register entry — opening, expected vs. actual closing, and variance.</p>
        </div>
      </div>

      <div className="tabs">
        <Link
          className={`tab${tab === "daily" ? " active" : ""}`}
          href={buildRegisterHistoryHref(searchParams, { tab: "daily", from: undefined, to: undefined })}
        >
          Daily register
        </Link>
        <Link
          className={`tab${tab === "monthly" ? " active" : ""}`}
          href={buildRegisterHistoryHref(searchParams, { tab: "monthly", from: undefined, to: undefined })}
        >
          Monthly register
        </Link>
      </div>
    </>
  );
}
