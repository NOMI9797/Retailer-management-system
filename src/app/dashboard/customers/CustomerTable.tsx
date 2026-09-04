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
    page,
  });

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Area</th>
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
              result.customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.phone || "—"}</td>
                  <td>{customer.area?.name || "—"}</td>
                  <td>
                    {customer.accounts.length === 0
                      ? "—"
                      : customer.accounts.map((a) => a.accountType.name).join(", ")}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn btn-ghost" href={`/dashboard/customers/${customer.id}`}>
                        View
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
        hrefFor={(p) => buildCustomersHref(searchParams, { page: String(p) })}
      />
    </>
  );
}
