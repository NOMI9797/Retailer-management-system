"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importLegacyUdhaar } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Entry point for migrating an existing Udhaar balance from the
// shopkeeper's paper register — a one-time, per-customer data-entry
// tool, not a normal loan form. Deliberately NOT built on
// RecordAccountTransactionModal: no payment-method picker (always
// posts as CREDIT under the hood — see importLegacyUdhaar's comment
// on why this must never look like real cash/bank activity happening
// today) and no "today vs backdated" choice (always dated today,
// per the explicit decision — only the recovery/due date is
// settable). The Product/Grain choice is a label for the
// shopkeeper's own clarity on what the balance was originally for,
// folded into the saved transaction's notes.
//
// owedBy picks which direction: the customer owing the shop (the
// original, default case) or the SHOP owing the customer — e.g. an
// old grain deposit/purchase from before this software was in use
// that was never paid out. The shop-owes-customer case posts to the
// exact same "Borrowed from Customers" bucket a live
// createShopBorrowedLoan entry would, so it shows up there and in its
// totals identically, same "same flow, just a different entry point"
// requirement every import direction follows.
export function ImportUdhaarModal({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [sourceKind, setSourceKind] = useState<"PRODUCT" | "GRAIN">("PRODUCT");
  const [owedBy, setOwedBy] = useState<"CUSTOMER" | "SHOP">("CUSTOMER");
  const [recoveryDate, setRecoveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function reset() {
    setAmount("");
    setSourceKind("PRODUCT");
    setOwedBy("CUSTOMER");
    setRecoveryDate("");
    setNotes("");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await importLegacyUdhaar({
        customerId,
        amount: Number(amount),
        sourceKind,
        owedBy,
        recoveryDate: recoveryDate || undefined,
        notes: notes || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(
        owedBy === "SHOP"
          ? `Udhaar imported — shop owes ${formatMoney(Number(amount))}`
          : `Udhaar imported — ${formatMoney(Number(amount))}`
      );
      close();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" />
        </svg>
        Import data
      </button>

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Import Udhaar from register</h2>
            <p className="modal-sub">
              Bring an existing balance from your paper register into this customer&apos;s account — recorded
              today, with an optional recovery date.
            </p>

            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}

              <div className="field">
                <label>Who owes this</label>
                <div className="stock-toggle">
                  <button
                    type="button"
                    className={owedBy === "CUSTOMER" ? "active" : ""}
                    onClick={() => setOwedBy("CUSTOMER")}
                  >
                    Customer owes shop
                  </button>
                  <button
                    type="button"
                    className={owedBy === "SHOP" ? "active" : ""}
                    onClick={() => setOwedBy("SHOP")}
                  >
                    Shop owes customer
                  </button>
                </div>
              </div>

              <div className="field">
                <label>{owedBy === "SHOP" ? "Amount the shop owes" : "Amount owed"}</label>
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
                <label>This Udhaar was for</label>
                <div className="stock-toggle">
                  <button
                    type="button"
                    className={sourceKind === "PRODUCT" ? "active" : ""}
                    onClick={() => setSourceKind("PRODUCT")}
                  >
                    Product
                  </button>
                  <button
                    type="button"
                    className={sourceKind === "GRAIN" ? "active" : ""}
                    onClick={() => setSourceKind("GRAIN")}
                  >
                    Grain
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Recovery date (optional)</label>
                <input type="date" value={recoveryDate} onChange={(e) => setRecoveryDate(e.target.value)} />
              </div>

              <div className="field">
                <label>Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. carried over from the old register"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Importing…" : "Import Udhaar"}
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
