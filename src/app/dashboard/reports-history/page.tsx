import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { ReportsHistoryFilter } from "./ReportsHistoryFilter";
import { ReportsHistoryTable } from "./ReportsHistoryTable";
import type { ReportsHistorySearchParams } from "./searchParamsHref";

// Same shape as Register History: a page-head, a date-range filter,
// and a table of past days that links each row through to that day's
// full detail view (here, the Reports page's Daily tab).
export default async function ReportsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<ReportsHistorySearchParams>;
}) {
  const params = await searchParams;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Profit/Loss history</h1>
          <p>Every past day&apos;s profit &amp; loss — click a row for the full breakdown.</p>
        </div>
      </div>

      <div className="filter-bar">
        <ReportsHistoryFilter activeFrom={params.from ?? ""} activeTo={params.to ?? ""} />
      </div>

      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading history…" />}>
        <ReportsHistoryTable searchParams={params} />
      </Suspense>
    </div>
  );
}
