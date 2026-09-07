import { ExpensesDateRange } from "./ExpensesDateRange";
import type { ExpensesSearchParams } from "./searchParamsHref";

export function ExpensesFilterBar({ searchParams }: { searchParams: ExpensesSearchParams }) {
  return (
    <div className="filter-bar">
      <ExpensesDateRange activeFrom={searchParams.from ?? ""} activeTo={searchParams.to ?? ""} />
    </div>
  );
}
