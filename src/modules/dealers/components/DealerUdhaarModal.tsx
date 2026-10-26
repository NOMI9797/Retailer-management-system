"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importDealerUdhaar, receiveDealerPayment } from "../actions";
import { PayDealerDebtForm } from "./PayDealerDebtModal";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

type Direction = "DEALER" | "SHOP";

// A dealer's Udhaar popup — the dealer page's version of the customer
// page's Import data popup: one tab per direction (Dealer owes shop /
// Shop owes dealer), and inside each, either import an old balance in
// that direction or clear what's owed that way — so a payment is never
// entered as an opposite-direction import.
export function DealerUdhaarModal({
  dealerId,
  dealerName,
  shopOwes,
  dealerOwes,
  bankAccounts = [],
}: {
  dealerId: string;
  dealerName: string;
  shopOwes: number;
  dealerOwes: number;
  bankAccounts?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("DEALER");
  const [action, setAction] = useState<"IMPORT" | "CLEARANCE">("IMPORT");

  function close() {
    setOpen(false);
    setDirection("DEALER");
    setAction("IMPORT");
  }

  function saved() {
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
      >
        <svg
          className="icon"
          viewBox="0 0 24 24"
          style={{ width: 14, height: 14 }}
        >
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" />
        </svg>
        Import data
      </button>

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 760, padding: 28 }}
          >
            <h2>Udhaar — {dealerName}</h2>

            <div className="tabs" style={{ marginTop: 12, marginBottom: 16 }}>
              <button
                type="button"
                className={`tab${direction === "DEALER" ? " active" : ""}`}
                onClick={() => setDirection("DEALER")}
              >
                Dealer owes shop
              </button>
              <button
                type="button"
                className={`tab${direction === "SHOP" ? " active" : ""}`}
                onClick={() => setDirection("SHOP")}
              >
                Shop owes dealer
              </button>
            </div>

            <div className="field">
              <div className="stock-toggle">
                <button
                  type="button"
                  className={action === "IMPORT" ? "active" : ""}
                  onClick={() => setAction("IMPORT")}
                >
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
              <DealerImportForm
                key={direction}
                dealerId={dealerId}
                owedBy={direction}
                onSaved={saved}
                onCancel={close}
              />
            ) : direction === "SHOP" ? (
              shopOwes > 0.01 ? (
                <PayDealerDebtForm
                  dealerId={dealerId}
                  dealerName={dealerName}
                  amountOwed={shopOwes}
                  bankAccounts={bankAccounts}
                  onSaved={saved}
                  onCancel={close}
                />
              ) : (
                <NothingOwed
                  text="The shop doesn't owe this dealer anything right now."
                  onClose={close}
                />
              )
            ) : dealerOwes > 0.01 ? (
              <ReceiveDealerPaymentForm
                dealerId={dealerId}
                amountOwed={dealerOwes}
                bankAccounts={bankAccounts}
                onSaved={saved}
                onCancel={close}
              />
            ) : (
              <NothingOwed
                text="This dealer doesn't owe the shop anything right now."
                onClose={close}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function NothingOwed({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <>
      <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>{text}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}

// An old balance from the paper register, in the tab's direction.
function DealerImportForm({
  dealerId,
  owedBy,
  onSaved,
  onCancel,
}: {
  dealerId: string;
  owedBy: Direction;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await importDealerUdhaar({
        dealerId,
        owedBy,
        amount: Number(amount),
        reference,
        notes: notes || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(`Udhaar imported — ${formatMoney(Number(amount))}`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}
      <div className="field-row">
        <div className="field">
          <label>
            {owedBy === "SHOP"
              ? "Amount the shop owes"
              : "Amount the dealer owes"}
          </label>
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
          <label>Reference</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="field">
        <label>Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Importing…" : "Import Udhaar"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// The dealer paying the shop back — the mirror of PayDealerDebtForm.
export function ReceiveDealerPaymentForm({
  dealerId,
  amountOwed,
  bankAccounts,
  onSaved,
  onCancel,
}: {
  dealerId: string;
  amountOwed: number;
  bankAccounts: { id: string; name: string }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(amountOwed));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT">(
    "CASH",
  );
  const [bankAccountId, setBankAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await receiveDealerPayment({
        dealerId,
        amount: Number(amount),
        paymentMethod,
        bankAccountId: bankAccountId || undefined,
        reference,
        notes: notes || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(`Received ${formatMoney(Number(amount))} from dealer`);
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}
      <div className="field-row">
        <div className="field">
          <label>Amount received (max {formatMoney(amountOwed)})</label>
          <input
            type="number"
            step="any"
            min="0"
            max={amountOwed}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Received as</label>
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
      <div className="field">
        <label>Reference</label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Slip no. / register page"
          required
        />
      </div>
      <div className="field">
        <label>Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Record payment"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// "Receive payment" on the dealer page's "Dealer owes shop" card — the
// same form as the Udhaar popup's clearance, opened straight away.
export function ReceiveDealerPaymentModal({
  dealerId,
  dealerName,
  amountOwed,
  bankAccounts = [],
  className = "btn btn-primary",
}: {
  dealerId: string;
  dealerName: string;
  amountOwed: number;
  bankAccounts?: { id: string; name: string }[];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Receive payment
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 600 }}
          >
            <h2>Receive from {dealerName}</h2>
            <ReceiveDealerPaymentForm
              dealerId={dealerId}
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
