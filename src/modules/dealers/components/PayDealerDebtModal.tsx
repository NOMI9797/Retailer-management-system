"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { payDealerDebt } from "../actions";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Pays down what the shop owes a dealer. amount is capped at the
// dealer's own outstanding balance in the action, not trusted here.
// Rendered both inside PayDealerDebtModal and inline on the New entry
// screen (after a dealer is picked there).
export function PayDealerDebtForm({
  dealerId,
  dealerName,
  amountOwed,
  bankAccounts = [],
  onSaved,
  onCancel,
}: {
  dealerId: string;
  dealerName: string;
  amountOwed: number;
  bankAccounts?: { id: string; name: string }[];
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [amount, setAmount] = useState(String(amountOwed));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT">("CASH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    const response = await payDealerDebt({
      dealerId,
      amount: Number(amount),
      paymentMethod,
      bankAccountId: bankAccountId || undefined,
    });
    setIsSaving(false);
    if (response && "error" in response && !("data" in response)) {
      setError((response as { error: string }).error);
      return;
    }
    showToast(`Paid ${dealerName} — ${formatMoney(Number(amount))}`);
    onSaved?.();
  }

  return (
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
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Pay"}
        </button>
      </div>
    </form>
  );
}

export function PayDealerDebtModal({
  dealerId,
  dealerName,
  amountOwed,
  bankAccounts = [],
  label = "Pay debt",
  className = "btn btn-primary",
}: {
  dealerId: string;
  dealerName: string;
  amountOwed: number;
  bankAccounts?: { id: string; name: string }[];
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pay {dealerName}</h2>
            <p className="modal-sub">Outstanding: {formatMoney(amountOwed)}</p>
            <PayDealerDebtForm
              dealerId={dealerId}
              dealerName={dealerName}
              amountOwed={amountOwed}
              bankAccounts={bankAccounts}
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
