"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordAccountTransaction } from "../actions";

// Shared write path for the Customer Accounts ledger view AND the
// Debts page's "record repayment" quick action — one implementation
// of the form, so both entry points can never drift into two
// different validation/behavior rules. Only for Udhar/Regular
// accounts (see recordAccountTransaction's comment on why consignment
// is rejected there).
export function RecordAccountTransactionModal({
  customerAccountId,
  triggerLabel = "Record transaction",
  defaultDirection = "OUT",
  onClose,
}: {
  customerAccountId: string;
  triggerLabel?: string;
  defaultDirection?: "IN" | "OUT";
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!onClose);
  const [direction, setDirection] = useState<"IN" | "OUT">(defaultDirection);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT" | "CREDIT">("CASH");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function close() {
    setOpen(false);
    onClose?.();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await recordAccountTransaction({
        customerAccountId,
        direction,
        amount: Number(amount),
        paymentMethod,
        dueDate: direction === "OUT" && dueDate ? dueDate : undefined,
        notes: notes || undefined,
      });
      setAmount("");
      setDueDate("");
      setNotes("");
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record transaction");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {!onClose && (
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
          {triggerLabel}
        </button>
      )}

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Record transaction</h2>
            <p className="modal-sub">Record a loan given or a repayment received on this account.</p>

            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}

              <div className="field">
                <label>Type</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}>
                  <option value="OUT">Loan given (customer now owes more)</option>
                  <option value="IN">Repayment received (customer now owes less)</option>
                </select>
              </div>

              <div className="field-row">
                <div className="field">
                  <label>Amount</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Payment method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "ACCOUNT" | "CREDIT")}
                  >
                    <option value="CASH">Cash</option>
                    <option value="ACCOUNT">On account</option>
                    <option value="CREDIT">Udhaar</option>
                  </select>
                </div>
              </div>

              {direction === "OUT" && (
                <div className="field">
                  <label>Due date (optional)</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              )}

              <div className="field">
                <label>Notes (optional)</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={close} disabled={isSaving}>
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
