"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  recordGrainLoanReturn,
  updateGrainLoanReturn,
  type GrainLoanRow,
} from "../actions";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";
import { toLocalDateString } from "@/lib/utils";

type LoanReturn = GrainLoanRow["returns"][number];

// Record a give-back on a grain loan — or edit one (pass `ret`): some
// grain returned and/or some settled in money instead, in any mix, up
// to what's still owed. The money is typed in as actually paid (that
// day's rate), never worked out from the loan's rate.
export function GrainLoanReturnModal({
  loan,
  ret,
  bankAccounts = [],
}: {
  loan: GrainLoanRow;
  ret?: LoanReturn;
  bankAccounts?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {ret ? (
        <button
          className="icon-btn"
          onClick={() => setOpen(true)}
          title="Edit return"
        >
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      ) : (
        <button
          className="btn btn-primary"
          onClick={() => setOpen(true)}
          style={{ padding: "4px 10px", fontSize: 12.5 }}
        >
          Record return
        </button>
      )}
      {open && (
        <ReturnDialog
          loan={loan}
          ret={ret}
          bankAccounts={bankAccounts}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ReturnDialog({
  loan,
  ret,
  bankAccounts,
  onClose,
}: {
  loan: GrainLoanRow;
  ret?: LoanReturn;
  bankAccounts: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  // What can still be given back with this return (its own amounts count as available while editing).
  const available =
    loan.outstanding + (ret ? ret.quantityReturned + ret.quantityPaid : 0);
  const [quantityReturned, setQuantityReturned] = useState(
    ret ? String(ret.quantityReturned) : String(available),
  );
  const [quantityPaid, setQuantityPaid] = useState(
    ret ? String(ret.quantityPaid) : "0",
  );
  const [amount, setAmount] = useState(ret ? String(ret.amount) : "");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT">(
    ret?.paymentMethod ?? "CASH",
  );
  const [bankAccountId, setBankAccountId] = useState(ret?.bankAccountId ?? "");
  const [returnDate, setReturnDate] = useState(
    toLocalDateString(ret ? new Date(ret.returnDate) : new Date()),
  );
  const [reference, setReference] = useState(ret?.reference ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const unit = loan.unitName;
  const grain = Number(quantityReturned) || 0;
  const paid = Number(quantityPaid) || 0;
  const lent = loan.direction === "SHOP_LENT";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const payload = {
        quantityReturned: grain,
        quantityPaid: paid,
        amount: paid > 0 ? Number(amount) || 0 : 0,
        paymentMethod: paid > 0 ? paymentMethod : undefined,
        bankAccountId:
          paid > 0 && paymentMethod === "ACCOUNT"
            ? bankAccountId || undefined
            : undefined,
        returnDate,
        reference,
      };
      const result = ret
        ? await updateGrainLoanReturn({ id: ret.id, ...payload })
        : await recordGrainLoanReturn({ grainLoanId: loan.id, ...payload });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(ret ? "Return updated" : "Return recorded");
      onClose();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 600 }}
      >
        <h2>{ret ? "Edit return" : "Record return"}</h2>
        <p className="modal-sub">
          {lent
            ? `${loan.party.name} owes the shop`
            : `The shop owes ${loan.party.name}`}{" "}
          <strong>
            {available} {unit}
          </strong>{" "}
          of {loan.productName}
        </p>

        <form onSubmit={handleSubmit}>
          {error && <p className="form-banner error">{error}</p>}

          <div className="field-row">
            <div className="field">
              <label>
                Grain {lent ? "returned to shop" : "given back by shop"} ({unit}
                )
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={quantityReturned}
                onChange={(e) => setQuantityReturned(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Settled in money instead ({unit})</label>
              <input
                type="number"
                min="0"
                step="any"
                value={quantityPaid}
                onChange={(e) => setQuantityPaid(e.target.value)}
              />
            </div>
          </div>

          {paid > 0 && (
            <>
              <div className="field-row">
                <div className="field">
                  <label>Amount {lent ? "received" : "paid"} (Rs)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>{lent ? "Received as" : "Paid via"}</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as "CASH" | "ACCOUNT")
                    }
                  >
                    <option value="CASH">Cash</option>
                    <option value="ACCOUNT">Account/bank</option>
                  </select>
                </div>
              </div>
              {paymentMethod === "ACCOUNT" && (
                <BankAccountPicker
                  bankAccounts={bankAccounts}
                  value={bankAccountId}
                  onChange={setBankAccountId}
                />
              )}
            </>
          )}

          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Reference</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : ret ? "Save changes" : "Record return"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
