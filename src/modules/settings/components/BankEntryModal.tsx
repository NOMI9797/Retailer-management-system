"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBankEntry } from "../bankAccounts.actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney, toLocalDateString } from "@/lib/utils";

type Kind = "OPENING" | "WITHDRAW";

// Bank accounts page: money entered by hand. "Import balance" adds
// money that was already in the bank before it was tracked here (the
// balance goes up; Cash flow doesn't count it as that day's money in).
// "Withdraw to cash" moves money from the bank into the cash drawer.
export function BankEntryModal({ bankAccounts }: { bankAccounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("OPENING");
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(toLocalDateString(new Date()));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function openWith(next: Kind) {
    setKind(next);
    setBankAccountId(bankAccounts.length === 1 ? bankAccounts[0].id : "");
    setAmount("");
    setEntryDate(toLocalDateString(new Date()));
    setReference("");
    setNotes("");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await createBankEntry({
      bankAccountId,
      kind,
      amount: Number(amount),
      entryDate,
      reference,
      notes: notes || undefined,
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const name = bankAccounts.find((b) => b.id === bankAccountId)?.name ?? "bank";
    showToast(
      kind === "OPENING"
        ? `${formatMoney(Number(amount))} imported into ${name}`
        : `${formatMoney(Number(amount))} withdrawn from ${name} to cash`
    );
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => openWith("WITHDRAW")}>
          Withdraw to cash
        </button>
        <button type="button" className="btn btn-primary" onClick={() => openWith("OPENING")}>
          Import balance
        </button>
      </div>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{kind === "OPENING" ? "Import money into bank" : "Withdraw to cash"}</h2>
            <p className="modal-sub">
              {kind === "OPENING"
                ? "Money that was already in this bank before you started using the app. The balance goes up; Cash flow doesn't count it as money that came in that day."
                : "Cash taken out of the bank into the shop's cash drawer. The bank goes down and the cash drawer goes up — the shop's total money stays the same."}
            </p>

            <div className="stock-toggle" style={{ marginBottom: 14 }}>
              <button type="button" className={kind === "OPENING" ? "active" : ""} onClick={() => setKind("OPENING")}>
                Import balance
              </button>
              <button type="button" className={kind === "WITHDRAW" ? "active" : ""} onClick={() => setKind("WITHDRAW")}>
                Withdraw to cash
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field">
                <label>Bank account</label>
                <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required>
                  <option value="" disabled>
                    Select a bank account
                  </option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Amount (Rs)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Reference</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Slip no. / cheque / statement"
                    required
                  />
                </div>
                <div className="field">
                  <label>Notes (optional)</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : kind === "OPENING" ? "Import balance" : "Withdraw to cash"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={isSaving}>
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
