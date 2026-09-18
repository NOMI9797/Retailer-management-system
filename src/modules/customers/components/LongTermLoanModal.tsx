"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";
import { createLongTermLoan } from "../actions";
import type { DurationUnit } from "../schema";

// The Long-term Udhaar tab's "give a loan" entry point — search a
// customer, enter the amount and a duration (not a free date picker;
// the return date is always computed from today + duration, per the
// "auto-calculated" requirement), and save. Works even for a customer
// with no Udhaar account yet — createLongTermLoan auto-creates one.
export function LongTermLoanModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT" | "CREDIT">("CASH");
  const [durationValue, setDurationValue] = useState("1");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("MONTHS");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { customers, isLoading } = useCustomers(query.length >= 2 ? query : undefined);

  const returnDate = (() => {
    const value = Number(durationValue);
    if (!value || value <= 0) return null;
    const d = new Date();
    if (durationUnit === "DAYS") d.setDate(d.getDate() + value);
    else if (durationUnit === "WEEKS") d.setDate(d.getDate() + value * 7);
    else d.setMonth(d.getMonth() + value);
    return d;
  })();

  function reset() {
    setQuery("");
    setSelectedCustomer(null);
    setAmount("");
    setPaymentMethod("CASH");
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
    if (!selectedCustomer) {
      setError("Select a customer first");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await createLongTermLoan({
        customerId: selectedCustomer.id,
        amount: Number(amount),
        paymentMethod,
        durationValue: Number(durationValue),
        durationUnit,
        notes: notes || undefined,
      });
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
        Give long-term loan
      </button>

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Give a long-term loan</h2>
            <p className="modal-sub">
              A deliberate cash loan with a chosen term — not tied to a purchase.
            </p>

            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}

              <div className="field">
                <label>Customer</label>
                {selectedCustomer ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      border: "0.5px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 12px",
                    }}
                  >
                    <span>{selectedCustomer.name}</span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setSelectedCustomer(null)}
                      style={{ padding: "4px 10px", fontSize: 12 }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Type at least 2 characters…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query.length >= 2 && (
                      <div className="panel" style={{ marginTop: 6, overflow: "hidden" }}>
                        {isLoading ? (
                          <p style={{ padding: 12, color: "var(--ink-muted)", fontSize: 12.5 }}>Searching…</p>
                        ) : customers.length === 0 ? (
                          <p style={{ padding: 12, color: "var(--ink-muted)", fontSize: 12.5 }}>No matches.</p>
                        ) : (
                          customers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomer({ id: c.id, name: c.name });
                                setQuery("");
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                padding: "8px 12px",
                                background: "none",
                                border: "none",
                                borderBottom: "0.5px solid var(--border)",
                                cursor: "pointer",
                                fontSize: 13.5,
                                fontFamily: "inherit",
                              }}
                            >
                              {c.name}
                              {c.phone ? <span style={{ color: "var(--ink-muted)" }}> — {c.phone}</span> : null}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
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
                    onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "ACCOUNT" | "CREDIT")}
                  >
                    <option value="CASH">Cash</option>
                    <option value="ACCOUNT">On account</option>
                  </select>
                </div>
              </div>

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
                  <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}>
                    <option value="DAYS">Days</option>
                    <option value="WEEKS">Weeks</option>
                    <option value="MONTHS">Months</option>
                  </select>
                </div>
              </div>

              {returnDate && (
                <p style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: -8, marginBottom: 14 }}>
                  Return date: <strong style={{ color: "var(--ink)" }}>{returnDate.toLocaleDateString("en-PK")}</strong>{" "}
                  (calculated automatically)
                </p>
              )}

              <div className="field">
                <label>Notes (optional)</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving || !selectedCustomer}>
                  {isSaving ? "Saving…" : "Give loan"}
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
