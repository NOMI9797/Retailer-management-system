import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { DebtSummaryCards } from "./DebtSummaryCards";
import { DebtorTable } from "./DebtorTable";

// Not cached — a shopkeeper recording a repayment right here expects
// this page to reflect it on the very next load, same reasoning as
// the Dashboard/Reports "nothing cached" requirement.
export default function DebtsPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Udhaar</h1>
          <p>Who owes the shop money — loans and on-account balances, in one place.</p>
        </div>
      </div>

      <Suspense fallback={<PageLoader label="Loading summary…" />}>
        <DebtSummaryCards />
      </Suspense>

      <Suspense fallback={<PageLoader label="Loading debtors…" />}>
        <DebtorTable />
      </Suspense>
    </div>
  );
}
