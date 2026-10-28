"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearGrainRegisterStock, setGrainRegisterStock, type GrainRegisterStock } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Pencil on the Own stock / Stock value cards: type the grain's own
// stock and stock value from the register. Display only — nothing else
// in the system changes. "Use system figures" removes them again.
export function RegisterStockButton({
  productId,
  productName,
  unitName,
  register,
  system,
}: {
  productId: string;
  productName: string;
  unitName: string;
  register: GrainRegisterStock | null;
  // What the records add up to now, shown for comparison.
  system: { ownKg: number; ownValue: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ownKg, setOwnKg] = useState("");
  const [ownValue, setOwnValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function openModal() {
    setOwnKg(register ? String(register.ownKg) : "");
    setOwnValue(register ? String(register.ownValue) : "");
    setNote(register?.note ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await setGrainRegisterStock({
      productId,
      ownKg: Number(ownKg),
      ownValue: Number(ownValue),
      note: note || undefined,
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(`${productName}: register figures saved`);
    setOpen(false);
    router.refresh();
  }

  async function handleClear() {
    setIsSaving(true);
    await clearGrainRegisterStock(productId);
    setIsSaving(false);
    showToast(`${productName}: back to system figures`);
    setOpen(false);
    router.refresh();
  }

  const kg = Number(ownKg) || 0;
  const value = Number(ownValue) || 0;

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={openModal}
        title="Enter from register"
        style={{ position: "absolute", top: 10, right: 10 }}
      >
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{productName} — own stock from register</h2>
            <p className="modal-sub">
              Shown on the Own stock and Stock value cards only. Nothing else changes — customers, dealers, batches,
              sales and money stay exactly as recorded.
            </p>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>Own stock ({unitName})</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={ownKg}
                    onChange={(e) => setOwnKg(e.target.value)}
                    required
                    autoFocus
                  />
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>
                    System: {system.ownKg} {unitName}
                  </span>
                </div>
                <div className="field">
                  <label>Stock value (Rs)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={ownValue}
                    onChange={(e) => setOwnValue(e.target.value)}
                    required
                  />
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>
                    System: {formatMoney(system.ownValue)}
                  </span>
                </div>
              </div>
              <div className="field">
                <label>Note (optional)</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. register page 42" />
              </div>
              {kg > 0 && value > 0 && (
                <p style={{ margin: "0 0 12px", fontSize: 13 }}>
                  Cost per {unitName}: <strong>Rs {(value / kg).toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong>
                  {" · "}Difference from system: {Math.round((kg - system.ownKg) * 1000) / 1000} {unitName},{" "}
                  {formatMoney(Math.round((value - system.ownValue) * 100) / 100)}
                </p>
              )}
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </button>
                {register && (
                  <button type="button" className="btn btn-ghost" onClick={handleClear} disabled={isSaving}>
                    Use system figures
                  </button>
                )}
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
