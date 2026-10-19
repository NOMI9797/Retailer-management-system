"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney, formatDate, formatTime } from "@/lib/utils";
import { EditReceiptModal } from "@/modules/daily-sales/components/EditReceiptModal";
import { DeleteReceiptButton } from "@/modules/daily-sales/components/DeleteReceiptButton";
import { PrintReceiptButton } from "@/modules/printing/components/PrintReceiptButton";
import { getReceiptDetail } from "@/modules/daily-sales/actions";
import type { listReceiptsForDate } from "@/modules/daily-sales/actions";
import type { listProducts } from "@/modules/products/actions";

type Receipts = Awaited<ReturnType<typeof listReceiptsForDate>>;
type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceiptDetail>>>;
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Cash",
  ACCOUNT: "On account",
  CREDIT: "Udhaar",
  MIXED: "Mixed",
};

const PAYMENT_CLASS: Record<string, string> = {
  CASH: "pay-cash",
  ACCOUNT: "pay-account",
  CREDIT: "pay-credit",
  MIXED: "pay-mixed",
};

// The Receipts page's day table — one row per receipt (one visit),
// same brief-list-then-drill-down shape the user asked for. Edit
// fetches that one receipt's full detail on click (a direct call from
// the click handler, not an automatic useEffect-on-mount fetch — see
// EditSaleModal's own comment on why that pattern is avoided here)
// since the brief row this table shows doesn't carry full item/
// payment detail.
export function ReceiptsList({
  receipts,
  products,
  bankAccounts = [],
}: {
  receipts: Receipts;
  products: Product[];
  bankAccounts?: { id: string; name: string }[];
}) {
  const [editingReceipt, setEditingReceipt] = useState<ReceiptDetail | null>(null);
  const [loadingEditFor, setLoadingEditFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function openEdit(dailySaleId: string, visitAt: Date) {
    const key = `${dailySaleId}:${visitAt.getTime()}`;
    setLoadingEditFor(key);
    setLoadError(null);
    const detail = await getReceiptDetail(dailySaleId, visitAt);
    setLoadingEditFor(null);
    if (!detail) {
      setLoadError("Could not load this receipt");
      return;
    }
    setEditingReceipt(detail);
  }

  const dayTotal = receipts.reduce((sum, r) => sum + r.total, 0);

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Receipt #</th>
              <th style={{ width: "30%" }}>Customer</th>
              <th>Time</th>
              <th>Items</th>
              <th>Payment</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={7}>No receipts for this day.</td>
              </tr>
            ) : (
              receipts.map((row) => {
                const key = `${row.dailySaleId}:${row.visitAt.getTime()}`;
                const initial = row.buyerName.charAt(0).toUpperCase();

                return (
                  <tr key={key}>
                    <td style={{ fontWeight: 600 }}>#{row.receiptNumber}</td>
                    <td>
                      <div className="cust-cell">
                        <div className="cust-avatar">{initial}</div>
                        <span style={{ fontWeight: 500 }}>
                          {row.buyerName}
                          {row.buyerKind === "DEALER" && (
                            <span className="pay-badge pay-mixed" style={{ marginLeft: 8 }}>
                              Dealer
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td>{formatTime(row.visitAt)}</td>
                    <td>
                      {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
                    </td>
                    <td>
                      {row.paymentSummary && (
                        <span className={`pay-badge ${PAYMENT_CLASS[row.paymentSummary]}`}>
                          {PAYMENT_LABEL[row.paymentSummary]}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(row.total)}</td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                        <PrintReceiptButton dailySaleId={row.dailySaleId} visitAt={row.visitAt} />
                        <button
                          className="icon-btn"
                          onClick={() => openEdit(row.dailySaleId, row.visitAt)}
                          title="Edit"
                          disabled={loadingEditFor === key}
                        >
                          <svg className="icon" viewBox="0 0 24 24">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                        <DeleteReceiptButton dailySaleId={row.dailySaleId} visitAt={row.visitAt} />
                        <Link
                          className="btn btn-ghost"
                          href={`/dashboard/receipts/${row.dailySaleId}?visit=${row.visitAt.getTime()}`}
                        >
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

        {receipts.length > 0 && (
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
              {receipts.length} receipt{receipts.length === 1 ? "" : "s"} · {formatMoney(dayTotal)} total
            </span>
          </div>
        )}
      </div>

      {loadError && <p className="form-banner error" style={{ marginTop: 12 }}>{loadError}</p>}

      {editingReceipt && (
        <EditReceiptModal
          receipt={editingReceipt}
          products={products}
          bankAccounts={bankAccounts}
          onClose={() => setEditingReceipt(null)}
        />
      )}
    </>
  );
}
