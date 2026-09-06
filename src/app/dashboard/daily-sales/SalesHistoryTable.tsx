import Link from "next/link";
import { listDailySales } from "@/modules/daily-sales/actions";
import { formatMoney } from "@/lib/utils";
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
    fromDate: searchParams.from,
    toDate: searchParams.to,
    page,
  });

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Date</th>
              <th>Items</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.sales.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={5}>No sales recorded yet.</td>
              </tr>
            ) : (
              result.sales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.customerName}</td>
                  <td>{new Date(sale.saleDate).toLocaleDateString()}</td>
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
              ))
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
