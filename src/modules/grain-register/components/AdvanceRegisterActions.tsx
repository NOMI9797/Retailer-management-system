"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAdvanceRegister, updateAdvanceRegister, type AdvanceRegisterRow } from "../actions";
import type { AdvanceSection } from "../schema";
import { showToast } from "@/components/shared/toastStore";
import { toLocalDateString } from "@/lib/utils";

type Grain = { id: string; name: string };

// Edit / Delete for one advance stock entry from the register, on its
// row in the Grain loans or Bought — at their home table. Edit can move
// it to the other section. Display only.
export function AdvanceRegisterActions({ row, grains }: { row: AdvanceRegisterRow; grains: Grain[] }) {
  return (
    <>
      <EditEntryButton row={row} grains={grains} />
      <DeleteEntryButton id={row.id} />
    </>
  );
}

// Marks a row that came from the register (only on the Advance stock card).
export function RegisterBadge() {
  return (
    <span className="pay-badge pay-mixed" title="Entered from the register — only on the Advance stock card">
      From register
    </span>
  );
}

function EditEntryButton({ row, grains }: { row: AdvanceRegisterRow; grains: Grain[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<AdvanceSection>(row.section);
  const [productId, setProductId] = useState(row.productId);
  const [kg, setKg] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function openModal() {
    setSection(row.section);
    setProductId(row.productId);
    setKg(String(row.kg));
    setEntryDate(toLocalDateString(new Date(row.date)));
    setNote(row.note ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await updateAdvanceRegister({
      id: row.id,
      section,
      productId,
      kg: Number(kg),
      entryDate,
      note: note || undefined,
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Entry updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="icon-btn" onClick={openModal} title="Edit">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit advance stock entry</h2>
            <div className="tabs" style={{ marginTop: 12, marginBottom: 16 }}>
              {(["LOAN", "HOME"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`tab${section === s ? " active" : ""}`}
                  onClick={() => setSection(s)}
                >
                  {s === "LOAN" ? "Grain loan" : "Bought — at their home"}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>Grain</label>
                  <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
                    {grains.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Quantity ({row.unitName})</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={kg}
                    onChange={(e) => setKg(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Note (optional)</label>
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save changes"}
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

function DeleteEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteAdvanceRegister(id);
    setIsDeleting(false);
    setConfirming(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Entry deleted");
    router.refresh();
  }

  if (confirming) {
    return (
      <>
        <button className="btn btn-primary" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={isDeleting}>
          Cancel
        </button>
      </>
    );
  }
  return (
    <>
      {error && <span style={{ fontSize: 12.5, color: "var(--consigned-600)" }}>{error}</span>}
      <button className="icon-btn" onClick={() => setConfirming(true)} title="Delete">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
        </svg>
      </button>
    </>
  );
}
