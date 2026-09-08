import { Fragment } from "react";
import { listMonthlyExpenses, listMonthlyExpenseTypes } from "@/modules/expenses/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { Pagination } from "@/modules/products/components/Pagination";
import { EditMonthlyExpenseButton } from "@/modules/expenses/components/EditMonthlyExpenseButton";
import { DeleteExpenseButton } from "@/modules/expenses/components/DeleteExpenseButton";
import { buildExpensesHref, type ExpensesSearchParams } from "./searchParamsHref";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Cash",
  ACCOUNT: "On account",
  CREDIT: "Credit",
};

const PAYMENT_CLASS: Record<string, string> = {
  CASH: "pay-cash",
  ACCOUNT: "pay-account",
  CREDIT: "pay-credit",
};

// Same structure as ExpensesTable (date-header grouping, payment
// badges, page total) — the one difference is a "Type" column instead
// of a free-text description, since Monthly expenses always pick a
// Settings-managed type.
export async function MonthlyExpensesTable({ searchParams }: { searchParams: ExpensesSearchParams }) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const [result, types] = await Promise.all([
    listMonthlyExpenses({
      fromDate: searchParams.from,
      toDate: searchParams.to,
      page,
    }),
    listMonthlyExpenseTypes(true),
  ]);

  const pageTotal = result.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  let lastDateKey: string | null = null;

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Payment</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.expenses.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={4}>No monthly expenses recorded yet.</td>
              </tr>
            ) : (
              result.expenses.map((expense) => {
                const dateKey = formatDate(expense.expenseDate);
                const isNewDay = dateKey !== lastDateKey;
                lastDateKey = dateKey;

                return (
                  <Fragment key={expense.id}>
                    {isNewDay && (
                      <tr className="table-date-header">
                        <td colSpan={4}>{dateKey}</td>
                      </tr>
                    )}
                    <tr>
                      <td>{expense.monthlyExpenseType?.name ?? expense.description}</td>
                      <td>
                        <span className={`pay-badge ${PAYMENT_CLASS[expense.paymentMethod]}`}>
                          {PAYMENT_LABEL[expense.paymentMethod]}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(Number(expense.amount))}</td>
                      <td>
                        <div className="row-actions">
                          <EditMonthlyExpenseButton expense={expense} types={types} />
                          <DeleteExpenseButton expenseId={expense.id} />
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {result.expenses.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 20px",
              fontSize: 12,
              color: "var(--ink-muted)",
            }}
          >
            <span>
              {result.expenses.length} expense{result.expenses.length === 1 ? "" : "s"} · {formatMoney(pageTotal)}{" "}
              total
            </span>
            <span>
              {result.totalPages > 1 ? `Page ${result.page} of ${result.totalPages}` : "Showing all results"}
            </span>
          </div>
        )}
      </div>

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        totalCount={result.totalCount}
        hrefFor={(p) => buildExpensesHref(searchParams, { page: String(p) })}
      />
    </>
  );
}
