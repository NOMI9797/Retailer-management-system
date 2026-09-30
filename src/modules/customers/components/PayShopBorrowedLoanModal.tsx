"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { payShopBorrowedLoan } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Pays a customer back for money the shop borrowed from them (see
// ShopBorrowedLoanModal) — same trigger+modal shape as
// PayGrainDebtModal/PayExpenseDebtModal, capped server-side at what's
// still owed, supporting partial payoff over multiple visits.
export function PayShopBorrowedLoanModal({
  customerAccountId,
  customerName,
  balance,
  onDone,
}: {
  customerAccountId: string;
  customerName: string;
  balance: number;
  // Optional extra callback alongside router.refresh() — a caller
  // holding its own already-fetched client state (e.g.
  // UdhaarClearanceForm) needs to explicitly refetch, same reasoning
  // PayGrainDebtModal's own onDone prop already follows.
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(balance));
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
      await payShopBorrowedLoan({ customerAccountId, amount: parsedAmount, paymentMethod });
      showToast(`Paid ${customerName} ${formatMoney(parsedAmount)}`);
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
        Record repayment
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pay back {customerName}</h2>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>Amount (max {formatMoney(balance)})</label>
                  <input
                    type="number"
                    min="0"
                    max={balance}
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
