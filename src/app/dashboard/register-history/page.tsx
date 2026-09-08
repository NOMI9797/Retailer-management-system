import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { RegisterHistoryFilter } from "./RegisterHistoryFilter";
import { RegisterHistoryTable } from "./RegisterHistoryTable";
import type { RegisterHistorySearchParams } from "./searchParamsHref";

// A standalone ledger of past register days — separate from Cash
// Flow's single-day dashboard so a shopkeeper reviewing history isn't
// mixed in with today's live entry form. Clicking any row jumps to
// that day's full Cash Flow view.
export default async function RegisterHistoryPage({
  searchParams,
}: {
  searchParams: Promise<RegisterHistorySearchParams>;
}) {
  const params = await searchParams;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Register history</h1>
          <p>Every past day's cash register — opening, expected vs. actual closing, and variance.</p>
        </div>
      </div>

      <div className="filter-bar">
        <RegisterHistoryFilter activeFrom={params.from ?? ""} activeTo={params.to ?? ""} />
      </div>

      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading history…" />}>
        <RegisterHistoryTable searchParams={params} />
      </Suspense>
    </div>
  );
}
