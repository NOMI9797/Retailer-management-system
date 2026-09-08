import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { RegisterHistoryHeader } from "./RegisterHistoryHeader";
import { RegisterHistoryFilter } from "./RegisterHistoryFilter";
import { RegisterHistoryTable } from "./RegisterHistoryTable";
import { MonthlyRegisterPlaceholder } from "./MonthlyRegisterPlaceholder";
import type { RegisterHistorySearchParams } from "./searchParamsHref";

// Same tab shape as Products/Expenses: a header with real ?tab=
// navigation, only the active tab's content below it. Daily register
// is the existing fully-working ledger; Monthly register is a
// UI-only placeholder for now (see MonthlyRegisterPlaceholder).
export default async function RegisterHistoryPage({
  searchParams,
}: {
  searchParams: Promise<RegisterHistorySearchParams>;
}) {
  const params = await searchParams;
  const tab = params.tab === "monthly" ? "monthly" : "daily";

  return (
    <div>
      <RegisterHistoryHeader searchParams={params} />

      {tab === "daily" ? (
        <>
          <div className="filter-bar">
            <RegisterHistoryFilter activeFrom={params.from ?? ""} activeTo={params.to ?? ""} />
          </div>
          <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading history…" />}>
            <RegisterHistoryTable searchParams={params} />
          </Suspense>
        </>
      ) : (
        <MonthlyRegisterPlaceholder />
      )}
    </div>
  );
}
