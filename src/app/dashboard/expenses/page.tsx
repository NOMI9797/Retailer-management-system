import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { ExpensesHeader } from "./ExpensesHeader";
import { ExpensesFilterBar } from "./ExpensesFilterBar";
import { ExpensesTable } from "./ExpensesTable";
import type { ExpensesSearchParams } from "./searchParamsHref";

// Same shell shape as Daily Sales: a static header, a URL-driven date
// filter, and the actual list behind its own Suspense boundary.
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<ExpensesSearchParams>;
}) {
  const params = await searchParams;

  return (
    <div>
      <ExpensesHeader />
      <ExpensesFilterBar searchParams={params} />

      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading expenses…" />}>
        <ExpensesTable searchParams={params} />
      </Suspense>
    </div>
  );
}
