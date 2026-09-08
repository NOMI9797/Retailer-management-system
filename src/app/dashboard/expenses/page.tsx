import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { ExpensesHeader } from "./ExpensesHeader";
import { ExpensesFilterBar } from "./ExpensesFilterBar";
import { ExpensesTable } from "./ExpensesTable";
import { MonthlyExpensesDateRange } from "./MonthlyExpensesDateRange";
import { MonthlyExpensesTable } from "./MonthlyExpensesTable";
import { listMonthlyExpenseTypes } from "@/modules/expenses/actions";
import type { ExpensesSearchParams } from "./searchParamsHref";

// Same tab shape as the Products page: a header with real ?tab=
// navigation, and only the active tab's filter + table render below
// it — Daily expenses (feeds Cash Flow) and Monthly expenses
// (recorded only, not wired into anything yet — see schema.prisma's
// ExpenseType comment).
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<ExpensesSearchParams>;
}) {
  const params = await searchParams;
  const tab = params.tab === "monthly" ? "monthly" : "daily";
  const monthlyExpenseTypes = await listMonthlyExpenseTypes();

  return (
    <div>
      <ExpensesHeader searchParams={params} monthlyExpenseTypes={monthlyExpenseTypes} />

      {tab === "daily" ? (
        <>
          <ExpensesFilterBar searchParams={params} />
          <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading expenses…" />}>
            <ExpensesTable searchParams={params} />
          </Suspense>
        </>
      ) : (
        <>
          <div className="filter-bar">
            <MonthlyExpensesDateRange activeFrom={params.from ?? ""} activeTo={params.to ?? ""} />
          </div>
          <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading monthly expenses…" />}>
            <MonthlyExpensesTable searchParams={params} />
          </Suspense>
        </>
      )}
    </div>
  );
}
