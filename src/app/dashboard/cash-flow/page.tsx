import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { CashFlowDatePicker } from "./CashFlowDatePicker";
import { CashFlowDayView } from "./CashFlowDayView";
import { todayDateString, type CashFlowSearchParams } from "./searchParamsHref";

// A single day's full cash-flow dashboard — opening/cash in/cash out/
// expected/actual/variance, plus Account & Credit visibility and the
// day-close form. Register history now lives on its own page
// (/dashboard/register-history) so browsing past days doesn't compete
// with today's live entry screen; a history row links back here with
// ?date=... to inspect that specific day's full detail.
export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<CashFlowSearchParams>;
}) {
  const params = await searchParams;
  const date = params.date || todayDateString();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Cash flow</h1>
          <p>The daily cash register — what's expected in hand, what's actually there, and the difference.</p>
        </div>
      </div>

      <div className="filter-bar">
        <CashFlowDatePicker activeDate={date} />
      </div>

      <Suspense key={date} fallback={<PageLoader label="Loading register…" />}>
        <CashFlowDayView date={date} />
      </Suspense>
    </div>
  );
}
