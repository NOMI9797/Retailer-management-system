import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { CashFlowDatePicker } from "./CashFlowDatePicker";
import { CashFlowDayView } from "./CashFlowDayView";
import { CashRegisterHistoryFilter } from "./CashRegisterHistoryFilter";
import { CashRegisterHistory } from "./CashRegisterHistory";
import { todayDateString, type CashFlowSearchParams } from "./searchParamsHref";

// Two independent sections: today's (or a picked day's) register —
// opening/cash in/cash out/expected/actual, with the day-close form —
// and the historical register list below it. Each streams behind its
// own Suspense boundary so a slow one never blocks the other.
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

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "28px 0 12px" }}>Register history</h2>
      <div className="filter-bar">
        <CashRegisterHistoryFilter activeFrom={params.historyFrom ?? ""} activeTo={params.historyTo ?? ""} />
      </div>

      <Suspense
        key={JSON.stringify({ from: params.historyFrom, to: params.historyTo })}
        fallback={<PageLoader label="Loading history…" />}
      >
        <CashRegisterHistory searchParams={params} />
      </Suspense>
    </div>
  );
}
