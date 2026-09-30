import Link from "next/link";
import { listShopBorrowedLoans } from "@/modules/customers/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { PayShopBorrowedLoanModal } from "@/modules/customers/components/PayShopBorrowedLoanModal";

// Every customer the shop currently owes money to via a Shop Borrowed
// loan — same layout as DebtorTable, mirrored for the opposite money
// direction (the shop is the borrower here, not the customer).
export async function BorrowedFromCustomersTable() {
  const rows = await listShopBorrowedLoans();

  if (rows.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          The shop hasn't borrowed from any customer right now.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th style={{ textAlign: "right" }}>Borrowed</th>
            <th style={{ textAlign: "right" }}>Paid</th>
            <th style={{ textAlign: "right" }}>Remaining</th>
            <th>Borrowed since</th>
            <th>Due date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.customerAccountId} className={row.isOverdue ? "is-open" : undefined}>
              <td>
                <Link href={`/dashboard/customers/${row.customerId}`} className="name-link">
                  {row.customerName}
                </Link>
                {row.customerPhone && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>{row.customerPhone}</p>
                )}
              </td>
              <td className="num" style={{ textAlign: "right" }}>
                {formatMoney(row.totalBorrowed)}
              </td>
              <td className="num" style={{ textAlign: "right", color: "var(--primary-600)" }}>
                {formatMoney(row.totalPaid)}
              </td>
              <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                {formatMoney(row.balance)}
              </td>
              <td>
                {formatDate(row.borrowedSince)}
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                  {row.daysSince} day{row.daysSince === 1 ? "" : "s"} ago
                </p>
              </td>
              <td>
                {row.isOverdue ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontWeight: 700,
                      color: "var(--consigned-600)",
                      background: "var(--consigned-50)",
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                    }}
                  >
                    <svg className="icon" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}>
                      <path d="M12 9v4M12 17h.01M10.3 3.9L2.7 17.5A1.9 1.9 0 004.4 20.5h15.2a1.9 1.9 0 001.7-3L13.7 3.9a1.9 1.9 0 00-3.4 0z" />
                    </svg>
                    Overdue{row.dueDate ? ` · ${formatDate(row.dueDate)}` : ""}
                  </span>
                ) : row.dueDate ? (
                  formatDate(row.dueDate)
                ) : (
                  <span className="dash">—</span>
                )}
              </td>
              <td style={{ textAlign: "right" }}>
                <PayShopBorrowedLoanModal
                  customerAccountId={row.customerAccountId}
                  customerName={row.customerName}
                  balance={row.balance}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
