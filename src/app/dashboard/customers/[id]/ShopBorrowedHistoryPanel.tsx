"use client";

import { useState } from "react";
import { formatMoney, formatDate } from "@/lib/utils";
import { PayShopBorrowedLoanModal } from "@/modules/customers/components/PayShopBorrowedLoanModal";
import { EditAccountTransactionModal } from "@/modules/customers/components/EditAccountTransactionModal";
import { DeleteAccountTransactionButton } from "@/modules/customers/components/DeleteAccountTransactionButton";
import type { getCustomerShopBorrowedHistory } from "@/modules/customers/actions";

type History = Awaited<ReturnType<typeof getCustomerShopBorrowedHistory>>;
type Txn = History["transactions"][number];

// The customer detail page's "Udhaar to Shop" tab — every loan this
// customer has given the shop and every repayment made against it, in
// one flat table, same granularity PurchaseHistoryList shows for
// sales. Always rendered (even with zero history) rather than hidden
// until the first loan, matching Stock Udhaar's own tab — a
// shopkeeper giving this customer their FIRST Shop Borrowed loan just
// makes this tab go from empty to populated, nothing about the tab
// itself needs to spring into existence.
export function ShopBorrowedHistoryPanel({
  customerName,
  history,
  bankAccounts = [],
}: {
  customerName: string;
  history: History;
  bankAccounts?: { id: string; name: string }[];
}) {
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);

  if (history.transactions.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          This customer hasn&apos;t given the shop any Udhaar yet.
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
                  <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                    {txn.direction === "OUT" && history.balance > 0.01 && history.customerAccountId && (
                      <PayShopBorrowedLoanModal
                        customerAccountId={history.customerAccountId}
                        customerName={customerName}
                        balance={history.balance}
                      />
                    )}
                    <button className="icon-btn" onClick={() => setEditingTxn(txn)} title="Edit">
                      <svg className="icon" viewBox="0 0 24 24">
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                      </svg>
                    </button>
                    <DeleteAccountTransactionButton transactionId={txn.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingTxn && (
        <EditAccountTransactionModal
          transactionId={editingTxn.id}
          direction={editingTxn.direction}
          initialAmount={editingTxn.amount}
          initialPaymentMethod={editingTxn.paymentMethod}
          initialBankAccountId={editingTxn.bankAccountId}
          initialDueDate={editingTxn.dueDate}
          initialNotes={editingTxn.notes}
          bankAccounts={bankAccounts}
          onClose={() => setEditingTxn(null)}
        />
      )}
    </>
  );
}
