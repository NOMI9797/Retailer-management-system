"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LineItemsEditor, type LineItemDraft } from "./LineItemsEditor";
import { GrainItemsEditor, type GrainItemDraft } from "./GrainItemsEditor";
import { PaymentSplitEditor, type PaymentSplitDraft } from "./PaymentSplitEditor";
import { getDailySaleForEdit, updateDailySale } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import type { listProducts } from "@/modules/products/actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

// Fetches the sale's current items and payment split on open (the
// full row lives behind the purchase-history Suspense boundary and
// isn't available to this modal's ancestor), pre-fills the same
// LineItemsEditor/GrainItemsEditor + PaymentSplitEditor
// createDailySale's form uses, and calls updateDailySale on save —
// which reverses the original sale's effects and reapplies the
// edited items/split, per the milestone's reverse-then-reapply
// requirement.
//
// A sale is already established as all-Product or all-Grain by the
// time it's being edited (see NewSaleForm's "one entry, either a
// product or a grain" decision), so which editor to render is
// DERIVED from the fetched items' own product kind — there's no
// toggle here the way NewSaleForm has one, since switching an
// existing sale's whole kind mid-edit isn't a supported flow.
export function EditSaleModal({
  saleId,
  products,
  bankAccounts = [],
  onClose,
}: {
  saleId: string;
  products: Product[];
  bankAccounts?: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [saleKind, setSaleKind] = useState<"PRODUCT" | "GRAIN" | null>(null);
  const [productItems, setProductItems] = useState<LineItemDraft[]>([]);
  const [grainItems, setGrainItems] = useState<GrainItemDraft[]>([]);
  const [payments, setPayments] = useState<PaymentSplitDraft>({ cash: "", account: "", credit: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const simpleProducts = useMemo(() => products.filter((p) => p.stockKind === "SIMPLE"), [products]);
  const grainProducts = useMemo(() => products.filter((p) => p.stockKind === "GRAIN"), [products]);

  useEffect(() => {
    let cancelled = false;
    getDailySaleForEdit(saleId)
      .then((sale) => {
        if (cancelled) return;
        const isGrain = sale.items.some((item) => grainProducts.some((p) => p.id === item.productId));
        setSaleKind(isGrain ? "GRAIN" : "PRODUCT");
        if (isGrain) {
          setGrainItems(
            sale.items.map((item) => ({
              productId: item.productId,
              quantity: String(item.quantity),
              actualPrice: String(item.actualPrice),
              creditAmount: item.creditAmount !== undefined ? String(item.creditAmount) : undefined,
              creditDueDate: item.creditDueDate,
            }))
          );
        } else {
          setProductItems(
            sale.items.map((item) => ({
              productId: item.productId,
              quantity: String(item.quantity),
              actualPrice: String(item.actualPrice),
            }))
          );
        }
        setPayments({
          cash: sale.payments.cash ? String(sale.payments.cash) : "",
          account: sale.payments.account ? String(sale.payments.account) : "",
          credit: sale.payments.credit ? String(sale.payments.credit) : "",
          bankAccountId: sale.payments.bankAccountId,
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load sale");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  const items = saleKind === "PRODUCT" ? productItems : grainItems;
  const itemTotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.actualPrice) || 0), 0),
    [items]
  );

  async function submitUpdate() {
    if (!saleKind) return;
    const cash = Number(payments.cash) || 0;
    const account = Number(payments.account) || 0;
    const credit = Number(payments.credit) || 0;

    await updateDailySale({
      saleId,
      items:
        saleKind === "PRODUCT"
          ? productItems.map((i) => ({
              productId: i.productId,
              quantity: Number(i.quantity),
              actualPrice: Number(i.actualPrice),
            }))
          : grainItems.map((i) => ({
              productId: i.productId,
              quantity: Number(i.quantity),
              actualPrice: Number(i.actualPrice),
              creditAmount: i.creditAmount ? Number(i.creditAmount) : undefined,
              creditDueDate: i.creditDueDate,
            })),
      payments: { cash, account, credit, bankAccountId: payments.bankAccountId },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!saleKind) return;
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

    if (saleKind === "GRAIN" && grainItems.length > 1 && credit > 0) {
      if (grainItems.some((i) => !i.creditAmount)) {
        setSaveError("Specify how much Udhaar applies to each grain item");
        return;
      }
      const allocated = grainItems.reduce((sum, i) => sum + Number(i.creditAmount), 0);
      if (Math.abs(allocated - credit) > 0.01) {
        setSaveError("The grain items' Udhaar amounts must add up to the sale's total Udhaar");
        return;
      }
    }

    setIsSaving(true);
    try {
      await submitUpdate();
      showToast("Sale updated");
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
        ) : !saleKind ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>Loading…</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {saveError && <p className="form-banner error">{saveError}</p>}

            {saleKind === "PRODUCT" ? (
              <LineItemsEditor products={simpleProducts} items={productItems} onChange={setProductItems} />
            ) : (
              <GrainItemsEditor
                products={grainProducts}
                items={grainItems}
                onChange={setGrainItems}
                saleCreditAmount={Number(payments.credit) || 0}
              />
            )}

            <PaymentSplitEditor total={itemTotal} payments={payments} bankAccounts={bankAccounts} onChange={setPayments} />

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
