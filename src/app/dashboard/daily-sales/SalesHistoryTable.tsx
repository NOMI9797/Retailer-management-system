import { Fragment } from "react";
import Link from "next/link";
import { listDailySales } from "@/modules/daily-sales/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { Pagination } from "@/modules/products/components/Pagination";
import { buildDailySalesHref, type DailySalesSearchParams } from "./searchParamsHref";

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

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.sales.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={4}>No sales recorded yet.</td>
              </tr>
            ) : (
              result.sales.map((sale) => {
                const dateKey = formatDate(sale.saleDate);
                const isNewDay = dateKey !== lastDateKey;
                lastDateKey = dateKey;

                return (
                  <Fragment key={sale.id}>
                    {isNewDay && (
                      <tr className="table-date-header">
                        <td colSpan={4}>{dateKey}</td>
                      </tr>
                    )}
                    <tr>
                      <td>{sale.customerName}</td>
                      <td>{sale.itemCount}</td>
                      <td>{formatMoney(sale.total)}</td>
                      <td>
                        <div className="row-actions">
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
