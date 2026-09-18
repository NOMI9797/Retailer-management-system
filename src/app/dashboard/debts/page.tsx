import { Suspense } from "react";
import Link from "next/link";
import { PageLoader } from "@/components/shared/PageLoader";
import { DebtSummaryCards } from "./DebtSummaryCards";
import { DebtorTable } from "./DebtorTable";
import { LongTermLoanModal } from "@/modules/customers/components/LongTermLoanModal";
import { buildDebtsHref, type DebtsSearchParams } from "./searchParamsHref";
import type { DebtBucket } from "@/modules/debts/schema";

// Tab-based, same pattern as Settings/Expenses/Reports/New Sale:
// Regular/Daily Udhaar (accrues naturally from Credit sales, no fixed
// term — the original Udhaar tracking) and Long-term Udhaar (a
// deliberate cash loan with a chosen duration) are two fully isolated
// views over the same underlying account/ledger, distinguished by
// AccountTransaction.isLongTerm. Not cached — a shopkeeper recording
// a repayment right here expects this page to reflect it on the very
// next load, same reasoning as the Dashboard/Reports "nothing cached"
// requirement.
export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<DebtsSearchParams>;
}) {
  const params = await searchParams;
  const bucket: DebtBucket = params.tab === "long-term" ? "LONG_TERM" : "REGULAR";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Udhaar</h1>
          <p>
            {bucket === "REGULAR"
              ? "Who owes the shop money from purchases — loans and on-account balances, in one place."
              : "Deliberate cash loans with a chosen term, separate from purchase-driven Udhaar."}
          </p>
        </div>
        {bucket === "LONG_TERM" && <LongTermLoanModal />}
      </div>

      <div className="tabs">
        <Link className={`tab${bucket === "REGULAR" ? " active" : ""}`} href={buildDebtsHref({ tab: "regular" })}>
          Regular / Daily Udhaar
        </Link>
        <Link
          className={`tab${bucket === "LONG_TERM" ? " active" : ""}`}
          href={buildDebtsHref({ tab: "long-term" })}
        >
          Long-term Udhaar
        </Link>
      </div>

      <Suspense key={`summary-${bucket}`} fallback={<PageLoader label="Loading summary…" />}>
        <DebtSummaryCards bucket={bucket} />
      </Suspense>

      <Suspense key={`debtors-${bucket}`} fallback={<PageLoader label="Loading debtors…" />}>
        <DebtorTable bucket={bucket} />
      </Suspense>
    </div>
  );
}
