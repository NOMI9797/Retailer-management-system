"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LineItemsEditor, type LineItemDraft } from "./LineItemsEditor";
import { GrainItemsEditor, type GrainItemDraft } from "./GrainItemsEditor";
import { PaymentSplitEditor, type PaymentSplitDraft } from "./PaymentSplitEditor";
import { updateReceipt } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import type { listProducts } from "@/modules/products/actions";
import type { getReceiptDetail } from "../actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];
type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceiptDetail>>>;

// Edits ONE receipt (one visit), not a whole day's sale — see
// updateReceipt's comment. Seeded directly from the detail the
// Receipts page already fetched server-side (receipt prop), not a
// client-side fetch on open — the Receipts list/detail routes always
// have this data in hand already, so there's no reason to repeat
// EditSaleModal's useEffect-on-mount pattern here.
export function EditReceiptModal({
  receipt,
  products,
  bankAccounts = [],
  onClose,
}: {
  receipt: ReceiptDetail;
  products: Product[];
  bankAccounts?: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const simpleProducts = useMemo(() => products.filter((p) => p.stockKind === "SIMPLE"), [products]);
  const grainProducts = useMemo(() => products.filter((p) => p.stockKind === "GRAIN"), [products]);

  const isGrain = useMemo(
    () => receipt.items.some((item) => grainProducts.some((p) => p.id === item.productId)),
    [receipt.items, grainProducts]
  );

  const [productItems, setProductItems] = useState<LineItemDraft[]>(() =>
    isGrain
      ? []
      : receipt.items.map((item) => ({
          productId: item.productId,
          quantity: String(item.quantity),
          actualPrice: String(item.actualPrice),
        }))
  );
  const [grainItems, setGrainItems] = useState<GrainItemDraft[]>(() =>
    isGrain
      ? receipt.items.map((item) => ({
          productId: item.productId,
          quantity: String(item.quantity),
          actualPrice: String(item.actualPrice),
          creditAmount: item.creditAmount !== null ? String(item.creditAmount) : undefined,
        }))
      : []
  );
  const [payments, setPayments] = useState<PaymentSplitDraft>(() => {
    const cash = receipt.payments.find((p) => p.paymentMethod === "CASH")?.amount;
    const accountPayment = receipt.payments.find((p) => p.paymentMethod === "ACCOUNT");
    const credit = receipt.payments.find((p) => p.paymentMethod === "CREDIT")?.amount;
    return {
      cash: cash ? String(cash) : "",
      account: accountPayment?.amount ? String(accountPayment.amount) : "",
      credit: credit ? String(credit) : "",
      bankAccountId: accountPayment?.bankAccountId ?? undefined,
    };
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const items = isGrain ? grainItems : productItems;
  const itemTotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.actualPrice) || 0), 0),
    [items]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    if (isGrain && grainItems.length > 1 && credit > 0) {
      if (grainItems.some((i) => !i.creditAmount)) {
        setSaveError("Specify how much Udhaar applies to each grain item");
        return;
      }
      const allocated = grainItems.reduce((sum, i) => sum + Number(i.creditAmount), 0);
      if (Math.abs(allocated - credit) > 0.01) {
        setSaveError("The grain items' Udhaar amounts must add up to the receipt's total Udhaar");
        return;
      }
    }

    setIsSaving(true);
    const response = await updateReceipt({
      dailySaleId: receipt.dailySaleId,
      visitAt: receipt.visitAt,
      items: isGrain
        ? grainItems.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            actualPrice: Number(i.actualPrice),
            creditAmount: i.creditAmount ? Number(i.creditAmount) : undefined,
          }))
        : productItems.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            actualPrice: Number(i.actualPrice),
          })),
      payments: { cash, account, credit, bankAccountId: payments.bankAccountId },
    });
    if (!response.success) {
      setSaveError(response.error);
      setIsSaving(false);
      return;
    }
    showToast(`Receipt #${receipt.receiptNumber} updated`);
    onClose();
    setIsSaving(false);
    router.refresh();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <h2>Edit receipt #{receipt.receiptNumber}</h2>
        <p className="modal-sub">
          Stock and account balances are recalculated from scratch when you save. Only this receipt is affected —
          any other receipt from the same day is untouched.
        </p>

        <form onSubmit={handleSubmit}>
          {saveError && <p className="form-banner error">{saveError}</p>}

          {isGrain ? (
            <GrainItemsEditor
              products={grainProducts}
              items={grainItems}
              onChange={setGrainItems}
              saleCreditAmount={Number(payments.credit) || 0}
            />
          ) : (
            <LineItemsEditor products={simpleProducts} items={productItems} onChange={setProductItems} />
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
      </div>
    </div>
  );
}
