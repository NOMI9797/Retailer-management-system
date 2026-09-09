import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { ReportsHeader } from "./ReportsHeader";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { PnlReportPanel } from "./PnlReportPanel";
import { listAvailableSeasons } from "@/modules/reports/actions";
import { toLocalDateString } from "@/lib/utils";
import type { ReportsSearchParams } from "./searchParamsHref";
import type { ReportPeriodInput } from "@/modules/reports/schema";

// Same tab shape as Expenses/Register history: real ?tab= navigation,
// one period picker + one P&L panel for whichever view is active. All
// four views (Daily/Monthly/Yearly/Seasonal) share the exact same
// aggregation and the exact same panel component — only how the
// period is resolved differs, per the milestone's "same shape of
// numbers across all views."
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportsSearchParams>;
}) {
  const params = await searchParams;
  const tab = (["daily", "monthly", "yearly", "seasonal"].includes(params.tab ?? "")
    ? params.tab
    : "daily") as "daily" | "monthly" | "yearly" | "seasonal";

  const now = new Date();
  const today = toLocalDateString(now);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const seasons = tab === "seasonal" ? await listAvailableSeasons() : [];

  let period: ReportPeriodInput;
  if (tab === "daily") {
    period = { view: "daily", date: params.date || today };
  } else if (tab === "monthly") {
    period = {
      view: "monthly",
      year: Number(params.year) || currentYear,
      month: Number(params.month) || currentMonth,
    };
  } else if (tab === "yearly") {
    period = { view: "yearly", year: Number(params.year) || currentYear };
  } else {
    period = { view: "seasonal", season: params.season || seasons[0] || "" };
  }

  return (
    <div>
      <ReportsHeader tab={tab} />

      <div className="filter-bar">
        <ReportsPeriodPicker tab={tab} searchParams={params} seasons={seasons} today={today} />
      </div>

      <Suspense key={JSON.stringify(period)} fallback={<PageLoader label="Loading report…" />}>
        <PnlReportPanel period={period} />
      </Suspense>
    </div>
  );
}
