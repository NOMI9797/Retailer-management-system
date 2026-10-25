import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { CashFlowDatePicker } from "./CashFlowDatePicker";
import { CashFlowDayView } from "./CashFlowDayView";
import { todayDateString, type CashFlowSearchParams } from "./searchParamsHref";
import type { CashFlowPeriod } from "@/modules/cash-flow/actions";

// Cash flow for a day, week or month: money in, money out and the net
// up/down at a glance, then where it moved, what it was for, and — for
// a day — the cash drawer count. Register history lives on its own
// page (/dashboard/register-history); a row there links back here.
export default async function CashFlowPage({ searchParams }: { searchParams: Promise<CashFlowSearchParams> }) {
  const params = await searchParams;
  const date = params.date || todayDateString();
  const period: CashFlowPeriod = params.period === "week" || params.period === "month" ? params.period : "day";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Cash flow</h1>
          <p>Money in, money out, and whether the shop is up or down.</p>
        </div>
      </div>

      <CashFlowDatePicker activeDate={date} period={period} />

      <Suspense key={`${date}:${period}`} fallback={<PageLoader label="Loading cash flow…" />}>
        <CashFlowDayView date={date} period={period} />
      </Suspense>
    </div>
  );
}
