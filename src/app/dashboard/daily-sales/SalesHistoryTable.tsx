import { Fragment } from "react";
import Link from "next/link";
import { listDailySales } from "@/modules/daily-sales/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { Pagination } from "@/modules/products/components/Pagination";
import { buildDailySalesHref, type DailySalesSearchParams } from "./searchParamsHref";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Cash",
  ACCOUNT: "On account",
  CREDIT: "Credit",
  MIXED: "Mixed",
};

const PAYMENT_CLASS: Record<string, string> = {
  CASH: "pay-cash",
  ACCOUNT: "pay-account",
  CREDIT: "pay-credit",
  MIXED: "pay-mixed",
};

// Summary rows only, per the milestone: customer, date, item count,
// total bill. Full line-item detail deliberately doesn't live here —
// clicking through goes to that customer's own detail page, where
// the purchase history panel shows the actual items.
export async function SalesHistoryTable({ searchParams }: { searchParams: DailySalesSearchParams }) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const result = await listDailySales({
    customerId: searchParams.customer,
    search: searchParams.search,
    areaId: searchParams.area,
    accountTypeId: searchParams.accountType,
    fromDate: searchParams.from,
    toDate: searchParams.to,
    page,
  });

  // listDailySales already orders by saleDate desc, so same-day rows
  // are already adjacent — a date-header row is inserted whenever the
  // date changes, rather than repeating the date on every row, so
  // scanning the page makes it obvious which sales fall on which day
  // (mirrors the day-grouping already used on the customer's Purchase
  // History panel).
  let lastDateKey: string | null = null;
  const pageTotal = result.sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "36%" }}>Customer</th>
              <th>Items</th>
              <th>Payment</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.sales.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={5}>No sales recorded yet.</td>
              </tr>
            ) : (
              result.sales.map((sale) => {
                const dateKey = formatDate(sale.saleDate);
                const isNewDay = dateKey !== lastDateKey;
                lastDateKey = dateKey;
                const initial = sale.customerName.charAt(0).toUpperCase();

                return (
                  <Fragment key={sale.id}>
                    {isNewDay && (
                      <tr className="table-date-header">
                        <td colSpan={5}>{dateKey}</td>
                      </tr>
                    )}
                    <tr>
                      <td>
                        <div className="cust-cell">
                          <div className="cust-avatar">{initial}</div>
                          <span style={{ fontWeight: 500 }}>{sale.customerName}</span>
                        </div>
                      </td>
                      <td>
                        {sale.itemCount} item{sale.itemCount === 1 ? "" : "s"}
                      </td>
                      <td>
                        {sale.paymentSummary && (
                          <span className={`pay-badge ${PAYMENT_CLASS[sale.paymentSummary]}`}>
                            {PAYMENT_LABEL[sale.paymentSummary]}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(sale.total)}</td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                          <Link className="btn btn-ghost" href={`/dashboard/customers/${sale.customerId}`}>
                            View customer
                          </Link>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {result.sales.length > 0 && (
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
              {result.sales.length} sale{result.sales.length === 1 ? "" : "s"} · {formatMoney(pageTotal)} total
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
        hrefFor={(p) => buildDailySalesHref(searchParams, { page: String(p) })}
      />
    </>
  );
}
