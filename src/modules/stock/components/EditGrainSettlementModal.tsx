"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGrainSettlement } from "../actions";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";

// Edits a grain settlement's quantity/rate/payment method — same
// field shape as TransferPurchaseForm, since it's conceptually the
// same action (a purchase from the customer), just changing an
// existing one instead of creating a fresh one. See
// updateGrainSettlement's own comment for how the edit is applied
// under the hood (fully reversed, then fully redone with the new
// numbers).
export function EditGrainSettlementModal({
  accountTransactionId,
  initialQuantity,
  initialRate,
  initialPaymentMethod,
  initialBankAccountId,
  unitName,
  bankAccounts = [],
  onClose,
}: {
  accountTransactionId: string;
  initialQuantity: number;
  initialRate: number;
  initialPaymentMethod: "CASH" | "ACCOUNT" | "CREDIT" | null;
  initialBankAccountId?: string | null;
  unitName: string;
  bankAccounts?: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [rate, setRate] = useState(String(initialRate));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT" | "CREDIT">(initialPaymentMethod ?? "CASH");
  const [bankAccountId, setBankAccountId] = useState(initialBankAccountId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const parsedQuantity = Number(quantity) || 0;
  const parsedRate = Number(rate) || 0;
  const total = parsedQuantity * parsedRate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    const result = await updateGrainSettlement({
      accountTransactionId,
      quantity: parsedQuantity,
      rate: parsedRate,
      paymentMethod,
      bankAccountId: bankAccountId || undefined,
    });
    if (!result.success) {
      setError(result.error);
      setIsSaving(false);
      return;
    }
    showToast("Settlement updated");
    setIsSaving(false);
    onClose();
    router.refresh();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit settlement</h2>
        <p className="modal-sub">Edits this purchase&apos;s quantity, rate, and payment method.</p>

        <form onSubmit={handleSubmit}>
          {error && <p className="form-banner error">{error}</p>}

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
              <label>Agreed rate</label>
              <input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} required />
            </div>
          </div>

          <div className="field">
            <label>Pay via</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
              <option value="CASH">Cash</option>
              <option value="ACCOUNT">Account/bank</option>
              <option value="CREDIT">Udhaar — shop owes customer</option>
            </select>
          </div>

          {paymentMethod === "ACCOUNT" && (
            <BankAccountPicker bankAccounts={bankAccounts} value={bankAccountId} onChange={setBankAccountId} />
          )}

          <div className="modal-actions" style={{ alignItems: "center" }}>
            {total > 0 && (
              <p style={{ fontSize: 13, fontWeight: 600, marginRight: "auto" }}>
                Total: Rs {total.toLocaleString()} ({parsedQuantity} {unitName})
              </p>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
