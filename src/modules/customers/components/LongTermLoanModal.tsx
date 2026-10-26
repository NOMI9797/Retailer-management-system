"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLongTermLoan } from "../actions";
import {
  ExistingCustomerSearch,
  type PickedCustomer,
} from "./ExistingCustomerSearch";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { formatMoney } from "@/lib/utils";
import { showToast } from "@/components/shared/toastStore";
import type { DurationUnit } from "../schema";

// "Give a loan" — search a customer, enter the amount and a duration
// (not a free date picker; the return date is always computed from
// today + duration, per the "auto-calculated" requirement), and save.
// Works even for a customer with no Udhaar account yet —
// createLongTermLoan auto-creates one. Rendered both inside
// LongTermLoanModal (Udhaar page) and inline on the New entry screen.
export function LongTermLoanForm({
  bankAccounts,
  onSaved,
  onCancel,
  initialCustomer,
}: {
  bankAccounts: { id: string; name: string }[];
  onSaved?: () => void;
  onCancel?: () => void;
  // Opens with this customer already picked (New entry's person-first flow).
  initialCustomer?: { id: string; name: string };
}) {
  const [selectedCustomer, setSelectedCustomer] =
    useState<PickedCustomer | null>(initialCustomer ?? null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "ACCOUNT" | "CREDIT"
  >("CASH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [durationValue, setDurationValue] = useState("1");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("MONTHS");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const returnDate = (() => {
    const value = Number(durationValue);
    if (!value || value <= 0) return null;
    const d = new Date();
    if (durationUnit === "DAYS") d.setDate(d.getDate() + value);
    else if (durationUnit === "WEEKS") d.setDate(d.getDate() + value * 7);
    else d.setMonth(d.getMonth() + value);
    return d;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) {
      setError("Select a customer first");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const result = await createLongTermLoan({
        customerId: selectedCustomer.id,
        amount: Number(amount),
        paymentMethod,
        bankAccountId: bankAccountId || undefined,
        reference,
        durationValue: Number(durationValue),
        durationUnit,
        notes: notes || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(`Long-term loan given — ${formatMoney(Number(amount))}`);
      onSaved?.();
    } catch {
      setError("Failed to record loan");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Customer</label>
        <ExistingCustomerSearch
          value={selectedCustomer}
          onChange={setSelectedCustomer}
        />
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
          <label>Given as</label>
          <select
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as "CASH" | "ACCOUNT" | "CREDIT")
            }
          >
            <option value="CASH">Cash</option>
            <option value="ACCOUNT">On account</option>
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

      <div className="field-row">
        <div className="field">
          <label>Borrowed for</label>
          <input
            type="number"
            min="1"
            step="1"
            value={durationValue}
            onChange={(e) => setDurationValue(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <select
            value={durationUnit}
            onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
          >
            <option value="DAYS">Days</option>
            <option value="WEEKS">Weeks</option>
            <option value="MONTHS">Months</option>
          </select>
        </div>
      </div>

      {returnDate && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--ink-muted)",
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          Return date:{" "}
          <strong style={{ color: "var(--ink)" }}>
            {returnDate.toLocaleDateString("en-PK")}
          </strong>{" "}
          (calculated automatically)
        </p>
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
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSaving || !selectedCustomer}
        >
          {isSaving ? "Saving…" : "Give loan"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function LongTermLoanModal({
  bankAccounts,
}: {
  bankAccounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Give long-term loan
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Give a long-term loan</h2>
            <p className="modal-sub">
              A deliberate cash loan with a chosen term — not tied to a
              purchase.
            </p>
            <LongTermLoanForm
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
