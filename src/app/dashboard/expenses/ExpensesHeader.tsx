import Link from "next/link";
import { buildExpensesHref, type ExpensesSearchParams } from "./searchParamsHref";
import { AddExpenseModal } from "@/modules/expenses/components/AddExpenseModal";
import { AddMonthlyExpenseModal } from "@/modules/expenses/components/AddMonthlyExpenseModal";
import type { listMonthlyExpenseTypes } from "@/modules/expenses/actions";

// Same tab pattern as Products' Simple/Grain stock — a real
// navigation via <Link> changing ?tab=, not client-side state, so
// switching tabs never waits on data underneath it. The Add button
// swaps with the tab: Daily expenses gets AddExpenseModal, Monthly
// expenses gets AddMonthlyExpenseModal.
export function ExpensesHeader({
  searchParams,
  monthlyExpenseTypes,
}: {
  searchParams: ExpensesSearchParams;
  monthlyExpenseTypes: Awaited<ReturnType<typeof listMonthlyExpenseTypes>>;
}) {
  const tab = searchParams.tab === "monthly" ? "monthly" : "daily";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Expenses</h1>
          <p>Daily and monthly expenses — every daily one tagged with how it was paid, for Cash Flow.</p>
        </div>
        {tab === "daily" ? <AddExpenseModal /> : <AddMonthlyExpenseModal types={monthlyExpenseTypes} />}
      </div>

      <div className="tabs">
        <Link
          className={`tab${tab === "daily" ? " active" : ""}`}
          href={buildExpensesHref(searchParams, { tab: "daily", from: undefined, to: undefined, page: undefined })}
        >
          Daily expenses
        </Link>
        <Link
          className={`tab${tab === "monthly" ? " active" : ""}`}
          href={buildExpensesHref(searchParams, { tab: "monthly", from: undefined, to: undefined, page: undefined })}
        >
          Monthly expenses
        </Link>
      </div>
    </>
  );
}
