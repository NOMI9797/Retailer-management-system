"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { payDealerDebt } from "../actions";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Pays down what the shop owes a dealer — same trigger+modal shape as
// PayGrainDebtModal/PayExpenseDebtModal. amount is capped at the
// dealer's own outstanding balance in the action, not trusted here.
export function PayDealerDebtModal({
  dealerId,
  dealerName,
  amountOwed,
  bankAccounts = [],
  label = "Pay debt",
}: {
  dealerId: string;
  dealerName: string;
  amountOwed: number;
  bankAccounts?: { id: string; name: string }[];
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(amountOwed));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT">("CASH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await payDealerDebt({
        dealerId,
        amount: Number(amount),
        paymentMethod,
        bankAccountId: bankAccountId || undefined,
      });
      showToast(`Paid ${dealerName} — ${formatMoney(Number(amount))}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pay {dealerName}</h2>
            <p className="modal-sub">Outstanding: {formatMoney(amountOwed)}</p>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}

              <div className="field">
                <label>Amount</label>
                <input
                  type="number"
                  min="0"
                  max={amountOwed}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Payment method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
                  <option value="CASH">Cash</option>
                  <option value="ACCOUNT">Account/bank</option>
                </select>
              </div>

              {paymentMethod === "ACCOUNT" && (
                <BankAccountPicker bankAccounts={bankAccounts} value={bankAccountId} onChange={setBankAccountId} />
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Pay"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
