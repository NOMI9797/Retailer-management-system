import { formatMoney, formatDate } from "@/lib/utils";
import { PayGrainSaleItemCreditModal } from "@/modules/daily-sales/components/PayGrainSaleItemCreditModal";
import type { getCustomerGrainCreditPurchases } from "@/modules/daily-sales/actions";

type Rows = Awaited<ReturnType<typeof getCustomerGrainCreditPurchases>>;

// The customer detail page's Grain → Customer Udhaar subtab: grain
// this customer bought FROM the shop at a settled rate and paid via
// Credit, still outstanding — the mirror of the Deposits subtab
// (where the customer is the seller/depositor; here they're the
// buyer). Every row is one real, individually-payable purchase (see
// getCustomerGrainCreditPurchases), same "Customer Udhaar" data the
// Grain page's shop-wide subtab shows, just scoped to this one
// customer.
export function CustomerGrainCreditPanel({ customerName, rows }: { customerName: string; rows: Rows }) {
  if (rows.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          This customer has no outstanding Udhaar for grain purchased from the shop.
        </p>
      </div>
    );
  }

  const totalRemaining = rows.reduce((sum, r) => sum + r.remaining, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0);

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <p className="stat-label">Owed by this customer</p>
          <p className="stat-value tone-consigned">{formatMoney(totalRemaining)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Collected so far</p>
          <p className="stat-value tone-primary">{formatMoney(totalPaid)}</p>
        </div>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
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
                      <span style={{ color: "var(--consigned-600)", fontWeight: 600 }}>{formatDate(row.dueDate)}</span>
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
                    customerName={customerName}
                    remaining={row.remaining}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
