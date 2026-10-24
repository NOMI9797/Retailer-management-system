import Link from "next/link";
import {
  getCustomerGrainCreditPurchases,
  getCustomerGrainCreditSummary,
} from "@/modules/daily-sales/actions";
import { CustomerUdhaarPaymentModal } from "@/modules/customers/components/CustomerUdhaarPayment";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate, matchesSearch } from "@/lib/utils";

// Shop-wide "Grain Udhaar" — the mirror of Shop (Udhaar)'s own Grain
// Udhaar subtab: here the CUSTOMER is the one who owes, having bought
// grain from the shop at a settled rate and paid via Credit instead
// of cash/account. One row per grain sale item; its paid/remaining is
// its share of the customer's overall Udhaar payments, spread oldest
// entry first (see getCustomerGrainCreditPurchases).
// productId optionally narrows both the stat cards and the table to
// one grain product — see the Debts page's GrainProductFilter, which
// renders the product-chip row above this section. search (the Udhaar
// page's search box) narrows only the table; the cards stay shop-wide.
export async function CustomerGrainCreditSection({
  productId,
  search,
}: { productId?: string; search?: string } = {}) {
  const [allRows, summary, bankAccounts] = await Promise.all([
    getCustomerGrainCreditPurchases(undefined, productId),
    getCustomerGrainCreditSummary(undefined, productId),
    listBankAccounts(),
  ]);
  const rows = allRows.filter((r) => matchesSearch(search, r.customerName));

  return (
    <>
      {allRows.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <p className="stat-label">Total owed by customers</p>
            <p className="stat-value tone-consigned">
              {formatMoney(summary.totalRemaining)}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Total collected so far</p>
            <p className="stat-value tone-primary">
              {formatMoney(summary.totalPaid)}
            </p>
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
            {search
              ? `No matches for "${search}".`
              : "No outstanding Grain Udhaar right now."}
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
                <tr
                  key={row.dailySaleItemId}
                  className={row.isOverdue ? "is-open" : undefined}
                >
                  <td>
                    <Link
                      href={`/dashboard/customers/${row.customerId}`}
                      className="name-link"
                    >
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
                  <td
                    className="num"
                    style={{ textAlign: "right", color: "var(--primary-600)" }}
                  >
                    {formatMoney(row.paid)}
                  </td>
                  <td
                    className="num"
                    style={{ textAlign: "right", fontWeight: 600 }}
                  >
                    {formatMoney(row.remaining)}
                  </td>
                  <td>{formatDate(row.purchaseDate)}</td>
                  <td>
                    {row.dueDate ? (
                      row.isOverdue ? (
                        <span
                          style={{
                            color: "var(--consigned-600)",
                            fontWeight: 600,
                          }}
                        >
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
                    {/* Grain Udhaar is paid off by the customer's one overall
                        Udhaar payment (oldest entry first), not per row. */}
                    <CustomerUdhaarPaymentModal
                      customerId={row.customerId}
                      customerName={row.customerName}
                      bankAccounts={bankAccounts}
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
