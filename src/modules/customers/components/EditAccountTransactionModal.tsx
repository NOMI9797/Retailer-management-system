"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAccountTransaction } from "../actions";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";
import { toLocalDateString } from "@/lib/utils";

// Edits a Regular/Long-term Udhaar entry OR a Shop Borrowed entry —
// amount, payment method/bank account, due date, notes. direction is
// shown but not editable (see updateAccountTransactionSchema's
// comment on why a bucket/direction change needs delete + re-add
// instead). Reused by both the Purchase History tab (Udhaar Cleared/
// Given rows) and the Udhaar to Shop tab, since both are just
// AccountTransaction rows under the hood.
export function EditAccountTransactionModal({
  transactionId,
  direction,
  initialAmount,
  initialPaymentMethod,
  initialBankAccountId,
  initialDueDate,
  initialNotes,
  bankAccounts = [],
  onClose,
}: {
  transactionId: string;
  direction: "IN" | "OUT";
  initialAmount: number;
  initialPaymentMethod: "CASH" | "ACCOUNT" | "CREDIT";
  initialBankAccountId?: string | null;
  initialDueDate?: Date | string | null;
  initialNotes?: string | null;
  bankAccounts?: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(initialAmount));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT" | "CREDIT">(initialPaymentMethod);
  const [bankAccountId, setBankAccountId] = useState(initialBankAccountId ?? "");
  const [dueDate, setDueDate] = useState(
    initialDueDate ? toLocalDateString(new Date(initialDueDate)) : ""
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await updateAccountTransaction({
        id: transactionId,
        amount: Number(amount),
        paymentMethod,
        bankAccountId: bankAccountId || undefined,
        dueDate: direction === "OUT" && dueDate ? dueDate : undefined,
        notes: notes || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast("Entry updated");
      onClose();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit entry</h2>
        <p className="modal-sub">
          {direction === "OUT" ? "Loan given — customer owes more." : "Repayment received — customer owes less."}
        </p>

        <form onSubmit={handleSubmit}>
          {error && <p className="form-banner error">{error}</p>}

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

          {paymentMethod === "ACCOUNT" && (
            <BankAccountPicker bankAccounts={bankAccounts} value={bankAccountId} onChange={setBankAccountId} />
          )}

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
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
