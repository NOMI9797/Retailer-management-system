"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LineItemsEditor, type LineItemDraft } from "./LineItemsEditor";
import { PaymentSplitEditor, type PaymentSplitDraft } from "./PaymentSplitEditor";
import { getDailySaleForEdit, updateDailySale } from "../actions";
import type { listProducts } from "@/modules/products/actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

// Fetches the sale's current items and payment split on open (the
// full row lives behind the purchase-history Suspense boundary and
// isn't available to this modal's ancestor), pre-fills the same
// LineItemsEditor/PaymentSplitEditor createDailySale's form uses, and
// calls updateDailySale on save — which reverses the original sale's
// effects and reapplies the edited items/split, per the milestone's
// reverse-then-reapply requirement.
export function EditSaleModal({
  saleId,
  products,
  onClose,
}: {
  saleId: string;
  products: Product[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<LineItemDraft[] | null>(null);
  const [payments, setPayments] = useState<PaymentSplitDraft>({ cash: "", account: "", credit: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDailySaleForEdit(saleId)
      .then((sale) => {
        if (cancelled) return;
        setItems(
          sale.items.map((item) => ({
            productId: item.productId,
            quantity: String(item.quantity),
            actualPrice: String(item.actualPrice),
          }))
        );
        setPayments({
          cash: sale.payments.cash ? String(sale.payments.cash) : "",
          account: sale.payments.account ? String(sale.payments.account) : "",
          credit: sale.payments.credit ? String(sale.payments.credit) : "",
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load sale");
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const itemTotal = useMemo(
    () => (items ?? []).reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.actualPrice) || 0), 0),
    [items]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!items) return;
    setSaveError(null);

    if (items.some((i) => !i.productId || !i.quantity || !i.actualPrice)) {
      setSaveError("Every item needs a product, quantity, and price");
      return;
    }

    const cash = Number(payments.cash) || 0;
    const account = Number(payments.account) || 0;
    const credit = Number(payments.credit) || 0;
    if (Math.abs(cash + account + credit - itemTotal) > 0.01) {
      setSaveError("Cash + Account + Credit must add up to the bill total");
      return;
    }

    setIsSaving(true);
    try {
      await updateDailySale({
        saleId,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          actualPrice: Number(i.actualPrice),
        })),
        payments: { cash, account, credit },
      });
      onClose();
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update sale");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <h2>Edit sale</h2>
        <p className="modal-sub">
          Stock, grain batches, and account balances are recalculated from scratch when you save.
        </p>

        {loadError ? (
          <p className="form-banner error">{loadError}</p>
        ) : !items ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>Loading…</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {saveError && <p className="form-banner error">{saveError}</p>}

            <LineItemsEditor products={products} items={items} onChange={setItems} />

            <PaymentSplitEditor total={itemTotal} payments={payments} onChange={setPayments} />

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
