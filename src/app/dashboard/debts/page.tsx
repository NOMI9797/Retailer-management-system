import { Suspense } from "react";
import Link from "next/link";
import { PageLoader } from "@/components/shared/PageLoader";
import { DebtSummaryCards } from "./DebtSummaryCards";
import { DebtorTable } from "./DebtorTable";
import { DefaulterTable } from "./DefaulterTable";
import { LongTermLoanModal } from "@/modules/customers/components/LongTermLoanModal";
import { buildDebtsHref, type DebtsSearchParams } from "./searchParamsHref";

type Tab = "regular" | "long-term" | "defaulters";

// Tab-based, same pattern as Settings/Expenses/Reports/New Sale:
// Regular/Daily Udhaar (accrues naturally from Credit sales, no fixed
// term — the original Udhaar tracking), Long-term Udhaar (a
// deliberate cash loan with a chosen duration), and Defaulters (a
// consolidated view of everyone currently overdue in EITHER bucket —
// due date past by more than the grace period, see GRACE_PERIOD_DAYS
// in modules/debts/actions.ts). A defaulter still shows up normally
// on their own Regular or Long-term tab too — this third tab is a
// read-only view layered on top, not a separate status that removes
// them from elsewhere. Not cached — a shopkeeper recording a
// repayment right here expects this page to reflect it on the very
// next load, same reasoning as the Dashboard/Reports "nothing cached"
// requirement.
export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<DebtsSearchParams>;
}) {
  const params = await searchParams;
  const tab: Tab =
    params.tab === "long-term" ? "long-term" : params.tab === "defaulters" ? "defaulters" : "regular";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Udhaar</h1>
          <p>
            {tab === "regular"
              ? "Who owes the shop money from purchases — loans and on-account balances, in one place."
              : tab === "long-term"
                ? "Deliberate cash loans with a chosen term, separate from purchase-driven Udhaar."
                : "Everyone more than a week past their due date, from either kind of Udhaar."}
          </p>
        </div>
        {tab === "long-term" && <LongTermLoanModal />}
      </div>

      <div className="tabs">
        <Link className={`tab${tab === "regular" ? " active" : ""}`} href={buildDebtsHref({ tab: "regular" })}>
          Regular / Daily Udhaar
        </Link>
        <Link className={`tab${tab === "long-term" ? " active" : ""}`} href={buildDebtsHref({ tab: "long-term" })}>
          Long-term Udhaar
        </Link>
        <Link className={`tab${tab === "defaulters" ? " active" : ""}`} href={buildDebtsHref({ tab: "defaulters" })}>
          Defaulters
        </Link>
      </div>

      {tab !== "defaulters" && (
        <Suspense key={`summary-${tab}`} fallback={<PageLoader label="Loading summary…" />}>
          <DebtSummaryCards bucket={tab === "long-term" ? "LONG_TERM" : "REGULAR"} />
        </Suspense>
      )}

      <Suspense key={`table-${tab}`} fallback={<PageLoader label="Loading…" />}>
        {tab === "defaulters" ? <DefaulterTable /> : <DebtorTable bucket={tab === "long-term" ? "LONG_TERM" : "REGULAR"} />}
      </Suspense>
    </div>
  );
}
