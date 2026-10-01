import { Fragment } from "react";
import { listBankAccountTransactions } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { Pagination } from "@/modules/products/components/Pagination";
import { buildBankAccountsHref, type BankAccountsSearchParams } from "./searchParamsHref";

// Every single row, across every feature in the app, where money
// moved through a bank account — merged into one combined,
// date-grouped feed (see listBankAccountTransactions for the full
// list of source tables), same table/pagination shape Sales History
// uses. Filterable to one bank account and/or a date range via
// BankAccountsFilterBar above this component.
export async function BankAccountTransactionsTable({ searchParams }: { searchParams: BankAccountsSearchParams }) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const result = await listBankAccountTransactions({
    bankAccountId: searchParams.bankAccount,
    fromDate: searchParams.from,
    toDate: searchParams.to,
    page,
  });

  let lastDateKey: string | null = null;

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Bank account</th>
              <th>Type</th>
              <th>Details</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={4}>No bank account transactions recorded yet.</td>
              </tr>
            ) : (
              result.rows.map((row) => {
                const dateKey = formatDate(row.date);
                const isNewDay = dateKey !== lastDateKey;
                lastDateKey = dateKey;

                return (
                  <Fragment key={row.id}>
                    {isNewDay && (
                      <tr className="table-date-header">
                        <td colSpan={4}>{dateKey}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ fontWeight: 500 }}>{row.bankAccountName}</td>
                      <td>
                        <span className={`pay-badge ${row.direction === "IN" ? "pay-cash" : "pay-credit"}`}>
                          {row.source}
                        </span>
                      </td>
                      <td>{row.description}</td>
                      <td
                        className="num"
                        style={{
                          textAlign: "right",
                          fontWeight: 600,
                          color: row.direction === "IN" ? "var(--primary-600)" : "var(--consigned-600)",
                        }}
                      >
                        {row.direction === "IN" ? "+" : "−"}
                        {formatMoney(row.amount)}
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {result.rows.length > 0 && (
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
              {result.totalCount} transaction{result.totalCount === 1 ? "" : "s"}
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
        hrefFor={(p) => buildBankAccountsHref(searchParams, { page: String(p) })}
      />
    </>
  );
}
