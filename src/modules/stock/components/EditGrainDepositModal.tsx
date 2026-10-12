"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGrainBatch } from "@/modules/products/batches.actions";
import { showToast } from "@/components/shared/toastStore";

// Edits a still-unsettled deposit's quantity — nothing else to edit
// at this stage (no rate/payment yet, see updateGrainBatchSchema's
// comment).
export function EditGrainDepositModal({
  batchId,
  initialQuantity,
  unitName,
  onClose,
}: {
  batchId: string;
  initialQuantity: number;
  unitName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    const result = await updateGrainBatch({ id: batchId, quantityIn: Number(quantity) });
    if (!result.success) {
      setError(result.error);
      setIsSaving(false);
      return;
    }
    showToast("Deposit updated");
    setIsSaving(false);
    onClose();
    router.refresh();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit deposit</h2>
        <p className="modal-sub">Still unsettled — only the quantity can be changed here.</p>

        <form onSubmit={handleSubmit}>
          {error && <p className="form-banner error">{error}</p>}

          <div className="field">
            <label>Quantity ({unitName})</label>
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions">
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
