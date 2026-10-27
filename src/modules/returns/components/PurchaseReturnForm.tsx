"use client";

import { useState } from "react";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { createPurchaseReturn, listReturnablePurchases, type ReturnablePurchase } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatDate, formatMoney, toLocalDateString } from "@/lib/utils";

type Method = "CASH" | "ACCOUNT" | "CREDIT";
const METHOD_LABEL: Record<Method, string> = { CASH: "Cash", ACCOUNT: "Bank", CREDIT: "Less owed to dealer" };

// Purchase return, against a purchase: pick the dealer, pick the
// purchase (products, or a grain batch bought from them), and how many
// go back. Stock goes down; the money comes back the way it was paid by
// default (cash, bank, or less owed to the dealer) — changeable.
export function PurchaseReturnForm({
  dealers,
  bankAccounts,
  initialDealerId,
  initialPurchases = [],
  onSaved,
}: {
  dealers: { id: string; name: string }[];
  bankAccounts: { id: string; name: string }[];
  initialDealerId?: string;
  // The purchases of the dealer already picked (loaded with the page).
  initialPurchases?: ReturnablePurchase[];
  onSaved?: () => void;
}) {
  const [dealerId, setDealerId] = useState(initialDealerId ?? "");
  const [purchases, setPurchases] = useState<ReturnablePurchase[]>(initialPurchases);
  const [purchaseId, setPurchaseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [method, setMethod] = useState<Method>("CREDIT");
  const [bankAccountId, setBankAccountId] = useState("");
  const [returnDate, setReturnDate] = useState(toLocalDateString(new Date()));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const purchase = purchases.find((p) => p.id === purchaseId) ?? null;
  const amount = purchase ? Math.round((Number(quantity) || 0) * purchase.rate * 100) / 100 : 0;

  async function loadPurchases(id: string) {
    setPurchaseId("");
    setQuantity("");
    if (!id) {
      setPurchases([]);
      return;
    }
    setIsLoading(true);
    setPurchases(await listReturnablePurchases(id));
    setIsLoading(false);
  }

  function pickPurchase(id: string) {
    setPurchaseId(id);
    setQuantity("");
    const p = purchases.find((x) => x.id === id);
    if (p) {
      setMethod(p.paymentMethod);
      setBankAccountId(p.bankAccountId ?? "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!purchase) return;
    setIsSaving(true);
    setError(null);
    const result = await createPurchaseReturn({
      ...(purchase.kind === "PRODUCT" ? { purchaseId: purchase.id } : { grainBatchId: purchase.id }),
      quantity: Number(quantity),
      refundMethod: method,
      bankAccountId: method === "ACCOUNT" ? bankAccountId : undefined,
      returnDate,
      reference,
      notes: notes || undefined,
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(`Purchase return saved — ${formatMoney(result.data.amount)}`);
    setReference("");
    setNotes("");
    const keep = purchaseId;
    await loadPurchases(dealerId);
    setPurchaseId(keep);
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Dealer</label>
        <select
          value={dealerId}
          onChange={(e) => {
            setDealerId(e.target.value);
            void loadPurchases(e.target.value);
          }}
          required
        >
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
        <label>Purchase</label>
        {isLoading ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5, margin: 0 }}>Loading purchases…</p>
        ) : purchases.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5, margin: 0 }}>
            {dealerId ? "No purchases from this dealer." : "Pick a dealer to see their purchases."}
          </p>
        ) : (
          <select value={purchaseId} onChange={(e) => pickPurchase(e.target.value)} required>
            <option value="" disabled>
              Select the purchase
            </option>
            {purchases.map((p) => (
              <option key={p.id} value={p.id} disabled={p.remaining <= 0}>
                {formatDate(p.date)} · {p.productName.trim()} · {p.quantity} {p.unitName} @ {formatMoney(p.rate)}
                {p.remaining <= 0 ? " · nothing left to return" : ` · ${p.remaining} ${p.unitName} returnable`}
              </option>
            ))}
          </select>
        )}
      </div>

      {purchase && (
        <>
          <div className="field-row">
            <div className="field">
              <label>
                Quantity going back ({purchase.unitName}) — up to {purchase.remaining}
              </label>
              <input
                type="number"
                min="0"
                max={purchase.remaining}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required />
            </div>
          </div>

          {amount > 0 && (
            <p style={{ margin: "0 0 12px", fontSize: 13.5 }}>
              Worth <strong>{formatMoney(amount)}</strong> ({quantity} {purchase.unitName} × {formatMoney(purchase.rate)})
            </p>
          )}

          <div className="field">
            <label>Money back as</label>
            <div className="stock-toggle">
              {(["CASH", "ACCOUNT", "CREDIT"] as const).map((m) => (
                <button key={m} type="button" className={method === m ? "active" : ""} onClick={() => setMethod(m)}>
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
              This purchase was paid by {METHOD_LABEL[purchase.paymentMethod].toLowerCase()}.
            </p>
          </div>
          {method === "ACCOUNT" && (
            <BankAccountPicker bankAccounts={bankAccounts} value={bankAccountId} onChange={setBankAccountId} />
          )}

          <div className="field-row">
            <div className="field">
              <label>Reference</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Slip no. / register page"
                required
              />
            </div>
            <div className="field">
              <label>Notes (optional)</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={isSaving || amount <= 0}>
              {isSaving ? "Saving…" : "Save purchase return"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
