"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { payExpenseDebt } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Pays down a CREDIT expense — the shop's own debt (rent, wages,
// supplier bills, etc. bought on Credit), not yet paid. Same
// trigger+modal shape as PayGrainDebtModal (stock module), which this
// mirrors: one payment per submit, capped server-side at what's still
// owed, supporting partial payoff over multiple visits.
export function PayExpenseDebtModal({
  expenseId,
  description,
  remaining,
  onDone,
}: {
  expenseId: string;
  description: string;
  remaining: number;
  // Optional extra callback alongside router.refresh() — a caller
  // holding its own already-fetched client state can explicitly
  // refetch, same reasoning as PayGrainDebtModal's onDone.
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(remaining));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT">("CASH");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) {
      setError("Enter an amount greater than zero");
      return;
    }

    setIsSaving(true);
    try {
      await payExpenseDebt({ expenseId, amount: parsedAmount, paymentMethod });
      showToast(`Paid ${formatMoney(parsedAmount)} — ${description}`);
      setOpen(false);
      router.refresh();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        Mark as paid
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pay — {description}</h2>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>Amount (max {formatMoney(remaining)})</label>
                  <input
                    type="number"
                    min="0"
                    max={remaining}
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Pay via</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
                    <option value="CASH">Cash</option>
                    <option value="ACCOUNT">Account/bank</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Recording…" : "Record payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
