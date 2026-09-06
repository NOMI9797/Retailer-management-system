import Link from "next/link";
import { listCustomers } from "@/modules/customers/actions";
import { Pagination } from "@/modules/products/components/Pagination";
import { buildCustomersHref, type CustomersSearchParams } from "./searchParamsHref";

// Async Server Component — the actual customer query, wrapped in its
// own Suspense boundary by page.tsx so the header/filter bar never
// wait on it.
export async function CustomerTable({ searchParams }: { searchParams: CustomersSearchParams }) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const result = await listCustomers({
    search: searchParams.search,
    areaId: searchParams.area,
    accountTypeId: searchParams.accountType,
    page,
  });

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Name</th>
              <th style={{ width: "18%" }}>Phone</th>
              <th style={{ width: "16%" }}>Area</th>
              <th>Accounts</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.customers.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={5}>No customers found.</td>
              </tr>
            ) : (
              result.customers.map((customer) => {
                const initial = customer.name.charAt(0).toUpperCase();
                return (
                  <tr key={customer.id}>
                    <td>
                      <div className="cust-cell">
                        <div className="cust-avatar">{initial}</div>
                        <span className="cust-name">{customer.name}</span>
                      </div>
                    </td>
                    <td className={customer.phone ? undefined : "muted-dash"}>{customer.phone || "—"}</td>
                    <td className={customer.area ? "area-tag" : "muted-dash"}>{customer.area?.name || "—"}</td>
                    <td>
                      {customer.accounts.length === 0 ? (
                        <span className="muted-dash">—</span>
                      ) : (
                        <div className="acct-tags">
                          {customer.accounts.map((a) => (
                            <span
                              key={a.id}
                              className={`acct-tag${a.accountType.tracksQuantity ? " consignment" : ""}`}
                            >
                              {a.accountType.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                        <Link className="btn btn-ghost" href={`/dashboard/customers/${customer.id}`}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {result.customers.length > 0 && (
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
              {result.totalCount} customer{result.totalCount === 1 ? "" : "s"}
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
        hrefFor={(p) => buildCustomersHref(searchParams, { page: String(p) })}
      />
    </>
  );
}
