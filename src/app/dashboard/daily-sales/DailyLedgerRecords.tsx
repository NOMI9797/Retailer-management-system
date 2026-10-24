"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney, formatDate } from "@/lib/utils";
import { showToast } from "@/components/shared/toastStore";
import { SaleVisitActions } from "@/modules/daily-sales/components/SaleVisitActions";
import { deleteBankAccountRow } from "@/modules/settings/bankAccounts.actions";
import type { LedgerRow } from "@/modules/ledger/actions";
import type { listProducts } from "@/modules/products/actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

const PAYMENT_LABEL: Record<string, string> = { CASH: "Cash", ACCOUNT: "On account", CREDIT: "Udhaar", MIXED: "Mixed" };
const PAYMENT_CLASS: Record<string, string> = {
  CASH: "pay-cash",
  ACCOUNT: "pay-account",
  CREDIT: "pay-credit",
  MIXED: "pay-mixed",
};

// The Daily sales page's Records, same layout as the Grain page's: one
// panel with two tabs — Credit (money in) and Debit (money out) — each
// a table of that side's entries. Sale rows keep their own Edit/Delete;
// every other row can be deleted through the same reversal the Bank
// Accounts history uses (deleteBankAccountRow), and its full edit lives
// on its own page (the name links there). The open tab is local UI
// state; rows come from the page's server fetch.
export function DailyLedgerRecords({
  credit,
  debit,
  products,
  bankAccounts,
}: {
  credit: LedgerRow[];
  debit: LedgerRow[];
  products: Product[];
  bankAccounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(row: LedgerRow) {
    if (!row.deleteRef) return;
    setIsDeleting(true);
    try {
      const result = await deleteBankAccountRow(row.deleteRef);
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      showToast("Entry deleted");
      router.refresh();
    } finally {
      setConfirmingId(null);
      setIsDeleting(false);
    }
  }

  const rows = tab === "CREDIT" ? credit : debit;
  const amountColor = tab === "CREDIT" ? "var(--primary-600)" : "var(--consigned-600)";

  return (
    <>
      <section className="panel">
        <div className="grain-table-head" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h3>Records</h3>
          <div className="tabs" style={{ margin: 0, borderBottom: "none" }}>
            <button
              type="button"
              className={`tab${tab === "CREDIT" ? " active" : ""}`}
              onClick={() => setTab("CREDIT")}
            >
              Credit — money in ({credit.length})
            </button>
            <button
              type="button"
              className={`tab${tab === "DEBIT" ? " active" : ""}`}
              onClick={() => setTab("DEBIT")}
            >
              Debit — money out ({debit.length})
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Entry</th>
              <th>Details</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={7}>Nothing recorded for this day.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>
                    <Link href={row.counterpartyHref} className="name-link">
                      {row.counterpartyName}
                    </Link>
                  </td>
                  <td>{row.label}</td>
                  <td style={{ color: "var(--ink-muted)", fontSize: 13 }}>{row.detail ?? ""}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600, color: amountColor }}>
                    {formatMoney(row.amount)}
                  </td>
                  <td>
                    {row.paymentMethod && (
                      <span className={`pay-badge ${PAYMENT_CLASS[row.paymentMethod]}`}>
                        {PAYMENT_LABEL[row.paymentMethod]}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      {row.saleId && row.visitAt ? (
                        <SaleVisitActions
                          dailySaleId={row.saleId}
                          visitAt={row.visitAt}
                          products={products}
                          bankAccounts={bankAccounts}
                        />
                      ) : row.deleteRef && confirmingId === row.id ? (
                        <>
                          <button className="btn btn-primary" onClick={() => handleDelete(row)} disabled={isDeleting}>
                            {isDeleting ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button className="btn btn-ghost" onClick={() => setConfirmingId(null)} disabled={isDeleting}>
                            Cancel
                          </button>
                        </>
                      ) : row.deleteRef ? (
                        <button className="icon-btn" onClick={() => setConfirmingId(row.id)} title="Delete">
                          <svg className="icon" viewBox="0 0 24 24">
                            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

    </>
  );
}
