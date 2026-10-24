"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDealerGrainPurchase } from "../actions";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";
import type { listDealers } from "../actions";
import type { listProducts } from "@/modules/products/actions";

type Dealers = Awaited<ReturnType<typeof listDealers>>;
type Products = Awaited<ReturnType<typeof listProducts>>["products"];

// Record a bulk grain purchase from a GRAIN dealer. Always a real,
// immediately-priced purchase (rate is required, never optional the
// way a customer's store-for-later deposit is). Rendered both inside
// RecordDealerGrainPurchaseModal and inline on the New entry screen.
export function DealerGrainPurchaseForm({
  dealers,
  products,
  bankAccounts,
  defaultDealerId,
  onSaved,
  onCancel,
}: {
  dealers: Dealers;
  products: Products;
  bankAccounts: { id: string; name: string }[];
  defaultDealerId?: string;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [dealerId, setDealerId] = useState(defaultDealerId ?? "");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT" | "CREDIT">("CASH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const total = (Number(quantity) || 0) * (Number(rate) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    const response = await createDealerGrainPurchase({
      dealerId,
      productId,
      quantity: Number(quantity),
      rate: Number(rate),
      paymentMethod,
      bankAccountId: bankAccountId || undefined,
    });
    setIsSaving(false);
    if (response && "error" in response && !("data" in response)) {
      setError((response as { error: string }).error);
      return;
    }
    showToast(`Purchase recorded — ${formatMoney(total)}`);
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Dealer</label>
        <select value={dealerId} onChange={(e) => setDealerId(e.target.value)} required>
          <option value="" disabled>
            Select a dealer
          </option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Product</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
          <option value="" disabled>
            Select a grain product
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Quantity</label>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Rate (per unit)</label>
          <input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} required />
        </div>
      </div>

      {total > 0 && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-muted)" }}>Total: {formatMoney(total)}</p>
      )}

      <div className="field">
        <label>Payment method</label>
        <div className="stock-toggle">
          {(["CASH", "ACCOUNT", "CREDIT"] as const).map((method) => (
            <button
              key={method}
              type="button"
              className={paymentMethod === method ? "active" : ""}
              onClick={() => setPaymentMethod(method)}
            >
              {method === "CREDIT" ? "Udhaar" : method.charAt(0) + method.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {paymentMethod === "ACCOUNT" && (
        <BankAccountPicker bankAccounts={bankAccounts} value={bankAccountId} onChange={setBankAccountId} />
      )}

      <div className="modal-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Record purchase"}
        </button>
      </div>
    </form>
  );
}

export function RecordDealerGrainPurchaseModal({
  dealers,
  products,
  bankAccounts,
  defaultDealerId,
}: {
  dealers: Dealers;
  products: Products;
  bankAccounts: { id: string; name: string }[];
  defaultDealerId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Record purchase
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Record dealer grain purchase</h2>
            <p className="modal-sub">Bulk grain bought from a dealer — adds directly to shop-owned stock.</p>
            <DealerGrainPurchaseForm
              dealers={dealers}
              products={products}
              bankAccounts={bankAccounts}
              defaultDealerId={defaultDealerId}
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
