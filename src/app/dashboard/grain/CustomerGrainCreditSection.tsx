import Link from "next/link";
import { getCustomerGrainCreditPurchases, getCustomerGrainCreditSummary } from "@/modules/daily-sales/actions";
import { PayGrainSaleItemCreditModal } from "@/modules/daily-sales/components/PayGrainSaleItemCreditModal";
import { formatMoney, formatDate } from "@/lib/utils";

// Shop-wide "Customer Udhaar" — the mirror of Shop Udhaar (the tab
// next to this one): here the CUSTOMER is the one who owes, having
// bought grain from the shop at a settled rate and paid via Credit
// instead of cash/account. Every row is a real, individually-payable
// purchase (see getCustomerGrainCreditPurchases — per grain sale
// item, never an approximated cross-item split), not folded into the
// customer's whole-account Udhaar balance shown on the Debts page.
export async function CustomerGrainCreditSection() {
  const [rows, summary] = await Promise.all([getCustomerGrainCreditPurchases(), getCustomerGrainCreditSummary()]);

  return (
    <>
      {rows.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <p className="stat-label">Total owed by customers</p>
            <p className="stat-value tone-consigned">{formatMoney(summary.totalRemaining)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Total collected so far</p>
            <p className="stat-value tone-primary">{formatMoney(summary.totalPaid)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Customers owing</p>
            <p className="stat-value">{summary.customerCount}</p>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="panel">
          <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
            No outstanding Customer Udhaar for grain right now.
          </p>
        </div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Product</th>
                <th style={{ textAlign: "right" }}>Quantity</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Borrowed</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Remaining</th>
                <th>Date</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dailySaleItemId} className={row.isOverdue ? "is-open" : undefined}>
                  <td>
                    <Link href={`/dashboard/customers/${row.customerId}`} className="name-link">
                      {row.customerName}
                    </Link>
                  </td>
                  <td>{row.productName}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {row.quantity} {row.unitName}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(row.rate)}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(row.borrowed)}
                  </td>
                  <td className="num" style={{ textAlign: "right", color: "var(--primary-600)" }}>
                    {formatMoney(row.paid)}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatMoney(row.remaining)}
                  </td>
                  <td>{formatDate(row.purchaseDate)}</td>
                  <td>
                    {row.dueDate ? (
                      row.isOverdue ? (
                        <span style={{ color: "var(--consigned-600)", fontWeight: 600 }}>
                          {formatDate(row.dueDate)}
                        </span>
                      ) : (
                        formatDate(row.dueDate)
                      )
                    ) : (
                      <span className="dash">—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <PayGrainSaleItemCreditModal
                      dailySaleItemId={row.dailySaleItemId}
                      customerName={row.customerName}
                      remaining={row.remaining}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
