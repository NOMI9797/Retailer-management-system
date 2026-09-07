import { AddExpenseModal } from "@/modules/expenses/components/AddExpenseModal";

export function ExpensesHeader() {
  return (
    <div className="page-head">
      <div>
        <h1>Expenses</h1>
        <p>Daily and monthly expenses — every one tagged with how it was paid, for Cash Flow.</p>
      </div>
      <AddExpenseModal />
    </div>
  );
}
