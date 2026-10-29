"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setGrainRegisterFigure } from "../actions";
import type { RegisterCard } from "../schema";
import { showToast } from "@/components/shared/toastStore";

// Pencil on a Grain page card: type that card's figure from the
// register. Display only — nothing else in the system changes. "Use
// system figure" removes it again.
export function RegisterStockButton({
  productId,
  productName,
  card,
  label,
  unit,
  register,
  system,
}: {
  productId: string;
  productName: string;
  card: RegisterCard;
  // The card's name, e.g. "Own stock".
  label: string;
  // "Rs" for money, otherwise the grain's unit.
  unit: string;
  register: number | undefined;
  // What the records add up to now, shown for comparison; null when
  // the card has no system figure.
  system: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const show = (n: number) => (unit === "Rs" ? `Rs ${n.toLocaleString()}` : `${n} ${unit}`);

  function openModal() {
    setValue(register !== undefined ? String(register) : "");
    setError(null);
    setOpen(true);
  }

  async function save(figure: number | null) {
    setIsSaving(true);
    setError(null);
    const result = await setGrainRegisterFigure({ productId, card, value: figure });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(figure === null ? `${label}: back to system figure` : `${label}: register figure saved`);
    setOpen(false);
    router.refresh();
  }

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
            <h2>
              {productName} — {label} from register
            </h2>
            <p className="modal-sub">
              Shown on this card only. Nothing else changes — customers, dealers, batches, sales and money stay exactly
              as recorded.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(Number(value));
              }}
            >
              {error && <p className="form-banner error">{error}</p>}
              <div className="field">
                <label>
                  {label} ({unit})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  autoFocus
                />
                {system !== null && (
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>
                    System: {show(system)}
                  </span>
                )}
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </button>
                {register !== undefined && (
                  <button type="button" className="btn btn-ghost" onClick={() => save(null)} disabled={isSaving}>
                    {system === null ? "Clear" : "Use system figure"}
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
