"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setCashInHandRegister } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// The Dashboard's Cash in hand tile with a pencil: type the amount from
// the register. Display only — no cash record changes. The tile shows
// the register figure (0 until one is entered).
export function CashInHandTile({
  register,
  system,
  total,
}: {
  register: number | null;
  // What the cash records say is in the drawer today, for comparison.
  system: number;
  // Shop has, for the share bar.
  total: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const value = register ?? 0;
  const share = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;

  function openModal() {
    setAmount(register !== null ? String(register) : "");
    setError(null);
    setOpen(true);
  }

  async function save(figure: number | null) {
    setIsSaving(true);
    setError(null);
    const result = await setCashInHandRegister({ amount: figure });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(figure === null ? "Cash in hand cleared" : "Cash in hand from register saved");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="dash-tile" style={{ position: "relative" }}>
      <Link href="/dashboard/cash-flow" className="dash-tile-label" style={{ display: "block", textDecoration: "none" }}>
        Cash in hand
      </Link>
      <p className="dash-tile-value num">{formatMoney(value)}</p>
      <div className="dash-tile-bar">
        <span style={{ width: `${share}%` }} />
      </div>
      <p className="dash-tile-note">{register !== null ? "From register" : "Not entered yet"}</p>
      <button
        type="button"
        className="icon-btn"
        onClick={openModal}
        title="Enter from register"
        style={{ position: "absolute", top: 8, right: 8 }}
      >
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Cash in hand from register</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(Number(amount));
              }}
            >
              {error && <p className="form-banner error">{error}</p>}
              <div className="field">
                <label>Cash in hand (Rs)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  autoFocus
                />
                <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>
                  System: {formatMoney(system)}
                </span>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </button>
                {register !== null && (
                  <button type="button" className="btn btn-ghost" onClick={() => save(null)} disabled={isSaving}>
                    Clear
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
    </div>
  );
}
