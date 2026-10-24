"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSaleVisit, getReceiptDetail } from "../actions";
import { EditReceiptModal } from "./EditReceiptModal";
import { EditSaleModal } from "./EditSaleModal";
import { showToast } from "@/components/shared/toastStore";
import type { listProducts } from "@/modules/products/actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];
type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceiptDetail>>>;

// Edit + Delete for ONE visit of a sale — used by every list that shows
// a sale row (Daily sales, a customer's Purchase history and Grain tab),
// so editing or deleting one sale never touches the customer's other
// visits that day (they share one DailySale). Edit opens that visit's
// receipt (EditReceiptModal); an older sale with no receipt row falls
// back to editing the whole sale. Delete goes through deleteSaleVisit.
export function SaleVisitActions({
  dailySaleId,
  visitAt,
  products,
  bankAccounts = [],
}: {
  dailySaleId: string;
  visitAt: Date;
  products: Product[];
  bankAccounts?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [editingWholeSale, setEditingWholeSale] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openEdit() {
    setIsOpening(true);
    try {
      const detail = await getReceiptDetail(dailySaleId, visitAt);
      if (detail) setReceipt(detail);
      else setEditingWholeSale(true);
    } finally {
      setIsOpening(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteSaleVisit(dailySaleId, visitAt);
    setIsDeleting(false);
    setConfirming(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Sale deleted");
    router.refresh();
  }

  return (
    <>
      {confirming ? (
        <>
          <span style={{ fontSize: 13, color: "var(--consigned-600)", marginRight: 8 }}>
            Delete this sale? Stock and balances will be reversed.
          </span>
          <button className="btn btn-primary" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting…" : "Yes, delete"}
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={isDeleting}>
            Cancel
          </button>
        </>
      ) : (
        <>
          {error && <span style={{ fontSize: 12.5, color: "var(--consigned-600)", marginRight: 8 }}>{error}</span>}
          <button className="icon-btn" onClick={openEdit} disabled={isOpening} title="Edit">
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
          <button className="icon-btn" onClick={() => setConfirming(true)} title="Delete">
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
            </svg>
          </button>
        </>
      )}

      {receipt && (
        <EditReceiptModal
          receipt={receipt}
          products={products}
          bankAccounts={bankAccounts}
          onClose={() => setReceipt(null)}
        />
      )}
      {editingWholeSale && (
        <EditSaleModal
          saleId={dailySaleId}
          products={products}
          bankAccounts={bankAccounts}
          onClose={() => setEditingWholeSale(false)}
        />
      )}
    </>
  );
}
