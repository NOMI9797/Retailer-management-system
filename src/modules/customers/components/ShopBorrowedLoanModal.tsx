"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createShopBorrowedLoan } from "../actions";
import { createCustomer } from "../actions";
import { CustomerPicker, type CustomerSelection } from "@/modules/daily-sales/components/CustomerPicker";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { formatMoney } from "@/lib/utils";
import { showToast } from "@/components/shared/toastStore";
import type { DurationUnit } from "../schema";
import type { listAreas } from "@/modules/settings/areas.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];

// The Shop (Udhaar) tab's "borrow from a customer" entry point — the
// mirror of LongTermLoanModal, but reuses CustomerPicker (the same
// search-or-create widget Daily Sales/Stock-from-customer use)
// instead of a bespoke existing-only search — the person the shop
// borrows from doesn't have to already be a customer on file (the
// milestone's explicit "it can be any other new person" requirement).
// A "new" pick is resolved into a real Customer (createCustomer)
// immediately on submit, same "resolve then proceed" pattern
// StockFromCustomerForm uses for its own picker, since
// createShopBorrowedLoan needs a real customerId either way.
export function ShopBorrowedLoanModal({ areas, bankAccounts = [] }: { areas: Area[]; bankAccounts?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<CustomerSelection | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT">("CASH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [durationValue, setDurationValue] = useState("1");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("MONTHS");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const dueDate = (() => {
    const value = Number(durationValue);
    if (!value || value <= 0) return null;
    const d = new Date();
    if (durationUnit === "DAYS") d.setDate(d.getDate() + value);
    else if (durationUnit === "WEEKS") d.setDate(d.getDate() + value * 7);
    else d.setMonth(d.getMonth() + value);
    return d;
  })();

  function reset() {
    setSelection(null);
    setAmount("");
    setPaymentMethod("CASH");
    setBankAccountId("");
    setDurationValue("1");
    setDurationUnit("MONTHS");
    setNotes("");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selection) {
      setError("Select a customer first");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      // A "new" pick has no customerId yet — resolve it into a real
      // customer first (same immediate-resolve reasoning
      // StockFromCustomerForm uses), since createShopBorrowedLoan
      // needs one either way.
      const customerId =
        selection.mode === "existing"
          ? selection.customerId
          : (
              await createCustomer({
                name: selection.name,
                phone: selection.phone,
                areaId: selection.areaId,
                accountTypeIds: selection.accountTypeIds,
              })
            ).id;
      const customerName = selection.name;

      const result = await createShopBorrowedLoan({
        customerId,
        amount: Number(amount),
        paymentMethod,
        bankAccountId: bankAccountId || undefined,
        durationValue: Number(durationValue),
        durationUnit,
        notes: notes || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(`Borrowed from ${customerName} — ${formatMoney(Number(amount))}`);
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record loan");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Borrow from customer
      </button>

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Borrow from a customer</h2>
            <p className="modal-sub">Cash the shop itself takes from a customer — not tied to a sale or purchase.</p>

            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}

              <CustomerPicker areas={areas} onChange={setSelection} />

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
                  <label>Received as</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "ACCOUNT")}>
                    <option value="CASH">Cash</option>
                    <option value="ACCOUNT">On account</option>
                  </select>
                </div>
              </div>

              {paymentMethod === "ACCOUNT" && (
                <BankAccountPicker bankAccounts={bankAccounts} value={bankAccountId} onChange={setBankAccountId} />
              )}

              <div className="field-row">
                <div className="field">
                  <label>To be repaid in</label>
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
                  <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}>
                    <option value="DAYS">Days</option>
                    <option value="WEEKS">Weeks</option>
                    <option value="MONTHS">Months</option>
                  </select>
                </div>
              </div>

              {dueDate && (
                <p style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: -8, marginBottom: 14 }}>
                  Due date: <strong style={{ color: "var(--ink)" }}>{dueDate.toLocaleDateString("en-PK")}</strong>{" "}
                  (calculated automatically)
                </p>
              )}

              <div className="field">
                <label>Notes (optional)</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving || !selection}>
                  {isSaving ? "Saving…" : "Borrow"}
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
