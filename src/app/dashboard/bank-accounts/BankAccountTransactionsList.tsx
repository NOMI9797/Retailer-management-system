"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBankAccountRow, type listBankAccountTransactions } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { showToast } from "@/components/shared/toastStore";
import { Pagination } from "@/modules/products/components/Pagination";
import { buildBankAccountsHref, type BankAccountsSearchParams } from "./searchParamsHref";

type Result = Awaited<ReturnType<typeof listBankAccountTransactions>>;

// Client leaf for the Bank Accounts transaction history — same split
// SalesHistoryTable/SalesHistoryList follows elsewhere. Deleting a row
// here deletes the real underlying record it came from (a sale, an
// expense, a dealer purchase, a repayment, ...), reversing whatever
// stock/balance/bank-account effects that record originally caused —
// see deleteBankAccountRow's comment for the full "which kind maps to
// which real delete" picture. Only shown once that kind actually has
// a working delete action wired up; deleteBankAccountRow returns a
// clear "not supported yet" error for the rest, which surfaces here
// the same way any other failure would.
export function BankAccountTransactionsList({
  result,
  searchParams,
}: {
  result: Result;
  searchParams: BankAccountsSearchParams;
}) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  let lastDateKey: string | null = null;

  async function handleDelete(row: Result["rows"][number]) {
    setIsDeleting(true);
    try {
      const result = await deleteBankAccountRow(row.deleteRef);
      if (!result.success) {
        showToast(result.error, "error");
        setConfirmingId(null);
        return;
      }
      showToast("Entry deleted");
      setConfirmingId(null);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={5}>No bank account transactions recorded yet.</td>
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
                        <td colSpan={5}>{dateKey}</td>
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
                      <td style={{ textAlign: "right" }}>
                        {confirmingId === row.id ? (
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            <button className="btn btn-primary" onClick={() => handleDelete(row)} disabled={isDeleting}>
                              {isDeleting ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() => setConfirmingId(null)}
                              disabled={isDeleting}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button className="icon-btn" onClick={() => setConfirmingId(row.id)} title="Delete">
                            <svg className="icon" viewBox="0 0 24 24">
                              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
                            </svg>
                          </button>
                        )}
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
