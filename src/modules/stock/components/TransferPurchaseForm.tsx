"use client";

import { useState } from "react";
import { createTransferPurchase } from "../actions";
import { showToast } from "@/components/shared/toastStore";

// The shopkeeper buying some or all of a customer's already-deposited
// batch, at an agreed rate (Stock Management spec, section 4). The
// quantity/rate computed total shown below is a PREVIEW only — the
// real price is finalized on submit, never auto-applied anywhere
// else, per the spec's "keep stock quantity and pricing separate"
// rule.
export function TransferPurchaseForm({
  grainBatchId,
  remainingClaim,
  unitName,
  onSaved,
  onCancel,
}: {
  grainBatchId: string;
  remainingClaim: number;
  unitName: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT" | "CREDIT">("CASH");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const parsedQuantity = Number(quantity) || 0;
  const parsedRate = Number(rate) || 0;
  const total = parsedQuantity * parsedRate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (parsedQuantity <= 0) {
      setError("Enter a quantity greater than zero");
      return;
    }
    if (parsedQuantity > remainingClaim) {
      setError(`Only ${remainingClaim} ${unitName} remains as this customer's claim`);
      return;
    }

    setIsSaving(true);
    try {
      await createTransferPurchase({
        grainBatchId,
        quantity: parsedQuantity,
        rate: parsedRate,
        paymentMethod,
      });
      showToast(`Purchased ${parsedQuantity} ${unitName} from customer`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record purchase");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field-row">
        <div className="field">
          <label>
            Quantity to purchase <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>(max {remainingClaim} {unitName})</span>
          </label>
          <input
            type="number"
            min="0"
            max={remainingClaim}
            step="any"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Agreed rate</label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Rs 0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
          />
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

      <div className="modal-actions" style={{ alignItems: "center" }}>
        {total > 0 && (
          <p style={{ fontSize: 13, fontWeight: 600, marginRight: "auto" }}>
            Total: Rs {total.toLocaleString()}
          </p>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Recording…" : "Record purchase"}
        </button>
      </div>
    </form>
  );
}
