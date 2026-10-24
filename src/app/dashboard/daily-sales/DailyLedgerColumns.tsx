"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/utils";
import { showToast } from "@/components/shared/toastStore";
import { EditSaleModal } from "@/modules/daily-sales/components/EditSaleModal";
import { DeleteSaleButton } from "@/modules/daily-sales/components/DeleteSaleButton";
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

// The Daily sales page's two columns: money in (Credit) and money out
// (Debit). Sale rows keep their own Edit/Delete; every other row can be
// deleted through the same reversal the Bank Accounts history uses
// (deleteBankAccountRow), and its full edit lives on its own page (the
// name links there).
export function DailyLedgerColumns({
  credit,
  debit,
  creditTotal,
  debitTotal,
  products,
  bankAccounts,
}: {
  credit: LedgerRow[];
  debit: LedgerRow[];
  creditTotal: number;
  debitTotal: number;
  products: Product[];
  bankAccounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
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

  function column(title: string, rows: LedgerRow[], total: number, side: "CREDIT" | "DEBIT") {
    const amountColor = side === "CREDIT" ? "var(--primary-600)" : "var(--consigned-600)";

    return (
      <section className="panel ledger-column">
        <div className="ledger-column-head">
          <h2>{title}</h2>
          <span style={{ color: amountColor }}>{formatMoney(total)}</span>
        </div>
        <table>
          <tbody>
            {rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={4}>Nothing recorded for this day.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={row.counterpartyHref} style={{ fontWeight: 500, color: "inherit" }}>
                      {row.counterpartyName}
                    </Link>
                    <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                      {row.label}
                      {row.detail && ` · ${row.detail}`}
                    </div>
                  </td>
                  <td>
                    {row.paymentMethod && (
                      <span className={`pay-badge ${PAYMENT_CLASS[row.paymentMethod]}`}>
                        {PAYMENT_LABEL[row.paymentMethod]}
                      </span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600, color: amountColor }}>
                    {formatMoney(row.amount)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      {row.saleId ? (
                        <>
                          <button className="icon-btn" onClick={() => setEditingSaleId(row.saleId)} title="Edit">
                            <svg className="icon" viewBox="0 0 24 24">
                              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                            </svg>
                          </button>
                          <DeleteSaleButton saleId={row.saleId} />
                        </>
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
    );
  }

  return (
    <>
      <div className="ledger-columns">
        {column("Daily Credit", credit, creditTotal, "CREDIT")}
        {column("Daily Debit", debit, debitTotal, "DEBIT")}
      </div>

      {editingSaleId && (
        <EditSaleModal
          saleId={editingSaleId}
          products={products}
          bankAccounts={bankAccounts}
          onClose={() => setEditingSaleId(null)}
        />
      )}
    </>
  );
}
