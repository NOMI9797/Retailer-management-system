"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { payGrainDebt } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Pays down money the shop owes a customer for already-settled grain
// bought on Credit (see stock/actions.ts: getShopOwedForGrain/
// payGrainDebt) — the shop's own debt to the customer, the opposite
// direction from a customer repaying the shop, so this is its own
// action/modal rather than reusing RecordAccountTransactionModal
// (which is built for that other direction). Same trigger+modal shape
// as every other "Add X"/action button in the app.
export function PayGrainDebtModal({
  customerId,
  productId,
  customerName,
  amountOwed,
  defaultAmount,
  label = "Mark as paid",
  onDone,
}: {
  customerId: string;
  // Which product's debt this payment clears — every payment is now
  // scoped to one product (see stock/actions.ts: payGrainDebt), so a
  // customer owing on both Cotton and Wheat needs two separate
  // payments/instances of this modal, never one combined lump sum.
  productId: string;
  customerName: string;
  // The customer's outstanding grain debt for THIS PRODUCT only —
  // always the ceiling on what can be paid here (a shopkeeper may
  // reasonably pay off more than one row's worth in a single
  // payment), even when this instance is opened from one specific
  // row.
  amountOwed: number;
  // Pre-fills the amount field to just THIS row's own amount when
  // opened from a per-settlement row (see CustomerGrainSection),
  // rather than defaulting to the whole account's total — the
  // shopkeeper can still edit it up to amountOwed if paying off more
  // at once. Falls back to amountOwed when omitted (the account-level
  // banner's own trigger).
  defaultAmount?: number;
  label?: string;
  // Optional extra callback alongside router.refresh() — a caller
  // holding its own already-fetched client state (e.g.
  // StockFromCustomerForm) needs to explicitly refetch.
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(defaultAmount ?? amountOwed));
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
      await payGrainDebt({ customerId, productId, amount: parsedAmount, paymentMethod });
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
        {label}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pay {customerName}</h2>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>Amount (max {formatMoney(amountOwed)})</label>
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
