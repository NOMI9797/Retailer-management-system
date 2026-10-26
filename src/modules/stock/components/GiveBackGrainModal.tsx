"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { giveBackUnsettledGrain, updateGrainDepositReturn } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { toLocalDateString } from "@/lib/utils";

// "Give back" on a deposit whose rate isn't settled: the customer takes
// their grain back as it is — no rate, no money either way; the kg only
// come off what's not settled. Same trigger + modal shape as
// BuyFromCustomerModal, which sits next to it. Pass `existing` to edit
// a give-back instead (pencil button): up to what's still unsettled
// plus what this give-back already took.
export function GiveBackGrainModal({
  grainBatchId,
  customerName,
  productName,
  unsettledQuantity,
  unitName,
  existing,
  onDone,
}: {
  grainBatchId: string;
  customerName: string;
  productName: string;
  unsettledQuantity: number;
  unitName: string;
  existing?: { id: string; quantity: number; returnDate: Date; reference: string; notes: string | null };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const maxQuantity = unsettledQuantity + (existing?.quantity ?? 0);
  const [quantity, setQuantity] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function openModal() {
    setQuantity(String(existing ? existing.quantity : unsettledQuantity));
    setReturnDate(toLocalDateString(existing ? new Date(existing.returnDate) : new Date()));
    setReference(existing?.reference ?? "");
    setNotes(existing?.notes ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const fields = { quantity: Number(quantity), returnDate, reference, notes: notes || undefined };
    const result = existing
      ? await updateGrainDepositReturn({ id: existing.id, ...fields })
      : await giveBackUnsettledGrain({ grainBatchId, ...fields });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(
      existing ? "Give-back updated" : `${quantity} ${unitName} ${productName} given back to ${customerName}`
    );
    setOpen(false);
    router.refresh();
    onDone?.();
  }

  return (
    <>
      {existing ? (
        <button type="button" className="icon-btn" onClick={openModal} title="Edit give-back">
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={openModal}>
          Give back
        </button>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{existing ? "Edit give-back" : `Give back to ${customerName}`}</h2>
            <p className="modal-sub">
              {existing ? (
                <>
                  Up to{" "}
                  <strong>
                    {maxQuantity} {unitName} {productName}
                  </strong>{" "}
                  can be given back. Lowering the quantity puts the difference back as {customerName}&apos;s unsettled
                  grain.
                </>
              ) : (
                <>
                  <strong>
                    {unsettledQuantity} {unitName} {productName}
                  </strong>{" "}
                  has no rate settled. Giving it back returns the grain as it is — no money is paid either way.
                </>
              )}
            </p>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>Quantity given back ({unitName})</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={maxQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required />
                </div>
              </div>
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
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : existing ? "Save changes" : "Give back"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={isSaving}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
