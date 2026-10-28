"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGrainPickup, updateGrainPickup } from "../homeGrain.actions";
import { showToast } from "@/components/shared/toastStore";
import { toLocalDateString } from "@/lib/utils";

// "Pick up" on grain the shop bought that is still at the customer's
// home: one trip brings some (or all) of it onto the shop's shelf. No
// money — it was paid for when bought. Pass `existing` to edit a trip
// instead (pencil button): up to what's still at the home plus what
// this trip already brought.
export function PickupGrainModal({
  grainBatchId,
  customerName,
  productName,
  remaining,
  unitName,
  existing,
  onDone,
}: {
  grainBatchId: string;
  customerName: string;
  productName: string;
  remaining: number;
  unitName: string;
  existing?: { id: string; quantity: number; date: Date; reference: string; notes: string | null };
  // For a caller holding its own fetched rows (Buy/Keep stock).
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const maxQuantity = Math.round((remaining + (existing?.quantity ?? 0)) * 1000) / 1000;
  const [quantity, setQuantity] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function openModal() {
    setQuantity(String(existing ? existing.quantity : remaining));
    setPickupDate(toLocalDateString(existing ? new Date(existing.date) : new Date()));
    setReference(existing?.reference ?? "");
    setNotes(existing?.notes ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const fields = { quantity: Number(quantity), pickupDate, reference, notes: notes || undefined };
    const result = existing
      ? await updateGrainPickup({ id: existing.id, ...fields })
      : await createGrainPickup({ grainBatchId, ...fields });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(existing ? "Pickup updated" : `${quantity} ${unitName} ${productName} picked up from ${customerName}'s home`);
    setOpen(false);
    router.refresh();
    onDone?.();
  }

  const left = Math.round((maxQuantity - (Number(quantity) || 0)) * 1000) / 1000;

  return (
    <>
      {existing ? (
        <button type="button" className="icon-btn" onClick={openModal} title="Edit pickup">
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      ) : (
        <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={openModal}>
          Pick up
        </button>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{existing ? "Edit pickup" : `Pick up from ${customerName}'s home`}</h2>
            <p className="modal-sub">
              <strong>
                {maxQuantity} {unitName} {productName}
              </strong>{" "}
              {existing ? "can be on this trip" : "is still at their home"}. It was paid for when bought — picking it
              up only brings it onto the shop&apos;s shelf (Total physical).
            </p>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>Quantity picked up ({unitName})</label>
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
                  {quantity !== "" && (
                    <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>
                      {left > 0 ? `${left} ${unitName} will still be at their home` : "All of it picked up"}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} required />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Reference</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Slip no. / vehicle / register page"
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
                  {isSaving ? "Saving…" : existing ? "Save changes" : "Pick up"}
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
