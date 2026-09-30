import { formatMoney, formatDate } from "@/lib/utils";
import { PayShopBorrowedLoanModal } from "@/modules/customers/components/PayShopBorrowedLoanModal";
import type { getCustomerShopBorrowedHistory } from "@/modules/customers/actions";

type History = Awaited<ReturnType<typeof getCustomerShopBorrowedHistory>>;

// The customer detail page's "Udhaar to Shop" tab — every loan this
// customer has given the shop and every repayment made against it, in
// one flat table, same granularity PurchaseHistoryList shows for
// sales. Always rendered (even with zero history) rather than hidden
// until the first loan, matching Stock Udhaar's own tab — a
// shopkeeper giving this customer their FIRST Shop Borrowed loan just
// makes this tab go from empty to populated, nothing about the tab
// itself needs to spring into existence.
export function ShopBorrowedHistoryPanel({ customerName, history }: { customerName: string; history: History }) {
  if (history.transactions.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          This customer hasn't given the shop any Udhaar yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <p className="stat-label">Total given to shop</p>
          <p className="stat-value tone-grain">{formatMoney(history.totalBorrowed)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total repaid so far</p>
          <p className="stat-value tone-primary">{formatMoney(history.totalPaid)}</p>
        </div>
        {history.balance > 0.01 && (
          <div className="stat-card">
            <p className="stat-label">Shop still owes</p>
            <p className="stat-value tone-consigned">{formatMoney(history.balance)}</p>
          </div>
        )}
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Via</th>
              <th>Due date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.transactions.map((txn) => (
              <tr key={txn.id}>
                <td>{formatDate(txn.transactionDate)}</td>
                <td>
                  <span className={`pay-badge ${txn.direction === "OUT" ? "pay-mixed" : "pay-cash"}`}>
                    {txn.direction === "OUT" ? "Given to shop" : "Repaid"}
                  </span>
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {formatMoney(txn.amount)}
                </td>
                <td>{txn.paymentMethod === "ACCOUNT" ? "Account" : "Cash"}</td>
                <td>{txn.dueDate ? formatDate(txn.dueDate) : <span className="dash">—</span>}</td>
                <td style={{ textAlign: "right" }}>
                  {txn.direction === "OUT" && history.balance > 0.01 && history.customerAccountId && (
                    <PayShopBorrowedLoanModal
                      customerAccountId={history.customerAccountId}
                      customerName={customerName}
                      balance={history.balance}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
