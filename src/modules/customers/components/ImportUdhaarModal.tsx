"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importLegacyUdhaar } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";
import { CustomerUdhaarClearance } from "@/modules/daily-sales/components/UdhaarClearanceForm";

// Migrating an existing Udhaar balance from the shopkeeper's paper
// register — a one-time, per-customer data-entry tool, not a normal
// loan form. Deliberately not built on RecordAccountTransactionModal:
// no payment-method picker (always posts as CREDIT under the hood —
// see importLegacyUdhaar's comment on why this must never look like
// real cash/bank activity happening today) and no "today vs backdated"
// choice (always dated today; only the recovery/due date is settable).
// The Product/Grain choice is a label for the shopkeeper's own clarity,
// folded into the saved transaction's notes.
//
// owedBy picks which direction: the customer owing the shop (the
// default) or the SHOP owing the customer — e.g. an old grain deposit
// from before this software was in use that was never paid out. That
// case posts to the same "Borrowed from Customers" bucket a live
// createShopBorrowedLoan entry would.
//
// Rendered both inside ImportUdhaarModal (customer page, where the
// direction comes from the modal's own tab — fixedOwedBy) and inline on
// the New entry screen (after a customer is picked there, with its own
// direction toggle).
export function ImportUdhaarForm({
  customerId,
  fixedOwedBy,
  onSaved,
  onCancel,
}: {
  customerId: string;
  fixedOwedBy?: "CUSTOMER" | "SHOP";
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [sourceKind, setSourceKind] = useState<"PRODUCT" | "GRAIN">("PRODUCT");
  const [chosenOwedBy, setOwedBy] = useState<"CUSTOMER" | "SHOP">("CUSTOMER");
  const owedBy = fixedOwedBy ?? chosenOwedBy;
  const [recoveryDate, setRecoveryDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
        reference,
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
      onSaved?.();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      {!fixedOwedBy && (
        <div className="field">
          <label>Who owes this</label>
          <div className="stock-toggle">
            <button type="button" className={owedBy === "CUSTOMER" ? "active" : ""} onClick={() => setOwedBy("CUSTOMER")}>
              Customer owes shop
            </button>
            <button type="button" className={owedBy === "SHOP" ? "active" : ""} onClick={() => setOwedBy("SHOP")}>
              Shop owes customer
            </button>
          </div>
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label>{owedBy === "SHOP" ? "Amount the shop owes" : "Amount owed"}</label>
          <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="field">
          <label>Reference</label>
          <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} required />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Udhaar was for</label>
          <div className="stock-toggle">
            <button
              type="button"
              className={sourceKind === "PRODUCT" ? "active" : ""}
              onClick={() => setSourceKind("PRODUCT")}
            >
              Product
            </button>
            <button type="button" className={sourceKind === "GRAIN" ? "active" : ""} onClick={() => setSourceKind("GRAIN")}>
              Grain
            </button>
          </div>
        </div>
        <div className="field">
          <label>Recovery date (optional)</label>
          <input type="date" value={recoveryDate} onChange={(e) => setRecoveryDate(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Notes (optional)</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Importing…" : "Import Udhaar"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// The customer page's Udhaar popup: one tab per direction (Customer
// owes shop / Shop owes customer), and inside each, either import an
// old balance in that direction or clear (pay) what's owed in that
// direction — so a payment is never entered as an opposite import.
export function ImportUdhaarModal({
  customerId,
  customerName,
  bankAccounts = [],
}: {
  customerId: string;
  customerName: string;
  bankAccounts?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"CUSTOMER" | "SHOP">("CUSTOMER");
  const [action, setAction] = useState<"IMPORT" | "CLEARANCE">("IMPORT");

  function close() {
    setOpen(false);
    setDirection("CUSTOMER");
    setAction("IMPORT");
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 760, padding: 28 }}>
            <h2>Udhaar — {customerName}</h2>

            <div className="tabs" style={{ marginTop: 12, marginBottom: 16 }}>
              <button
                type="button"
                className={`tab${direction === "CUSTOMER" ? " active" : ""}`}
                onClick={() => setDirection("CUSTOMER")}
              >
                Customer owes shop
              </button>
              <button
                type="button"
                className={`tab${direction === "SHOP" ? " active" : ""}`}
                onClick={() => setDirection("SHOP")}
              >
                Shop owes customer
              </button>
            </div>

            <div className="field">
              <div className="stock-toggle">
                <button type="button" className={action === "IMPORT" ? "active" : ""} onClick={() => setAction("IMPORT")}>
                  Import Udhaar
                </button>
                <button
                  type="button"
                  className={action === "CLEARANCE" ? "active" : ""}
                  onClick={() => setAction("CLEARANCE")}
                >
                  Udhaar clearance
                </button>
              </div>
            </div>

            {action === "IMPORT" ? (
              <ImportUdhaarForm
                key={direction}
                customerId={customerId}
                fixedOwedBy={direction}
                onSaved={() => {
                  close();
                  router.refresh();
                }}
                onCancel={close}
              />
            ) : (
              <>
                <CustomerUdhaarClearance
                  key={direction}
                  customer={{ id: customerId, name: customerName }}
                  side={direction}
                  bankAccounts={bankAccounts}
                />
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={close}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
