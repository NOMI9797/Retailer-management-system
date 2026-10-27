"use client";

import { useState } from "react";
import { CustomerPicker } from "@/modules/daily-sales/components/CustomerPicker";
import { DealerPicker } from "@/modules/dealers/components/DealerPicker";
import { createSaleReturn, listReturnableBills, type ReturnableBill } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatDate, formatMoney, toLocalDateString } from "@/lib/utils";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listDealers } from "@/modules/dealers/actions";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Sales return, against a bill: pick who's returning (customer or
// dealer), pick the bill, then how many of each item came back. The
// money goes back the way that bill was paid (shown before saving);
// the goods go back into stock.
export function SaleReturnForm({
  areas,
  dealers,
  initialCustomer,
  initialDealerId,
  initialBills = [],
  onSaved,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  dealers: Awaited<ReturnType<typeof listDealers>>;
  initialCustomer?: { id: string; name: string };
  initialDealerId?: string;
  // The bills of the person already picked (loaded with the page).
  initialBills?: ReturnableBill[];
  onSaved?: () => void;
}) {
  const [buyerKind, setBuyerKind] = useState<"CUSTOMER" | "DEALER">(initialDealerId ? "DEALER" : "CUSTOMER");
  const [dealerId, setDealerId] = useState(initialDealerId ?? "");
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? "");
  const [bills, setBills] = useState<ReturnableBill[]>(initialBills);
  const [billKey, setBillKey] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [returnDate, setReturnDate] = useState(toLocalDateString(new Date()));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const keyOf = (b: ReturnableBill) => `${b.dailySaleId}:${new Date(b.visitAt).getTime()}`;
  const bill = bills.find((b) => keyOf(b) === billKey) ?? null;

  async function loadBills(buyer: { customerId?: string; dealerId?: string }) {
    setBillKey("");
    setQuantities({});
    if (!buyer.customerId && !buyer.dealerId) {
      setBills([]);
      return;
    }
    setIsLoading(true);
    setBills(await listReturnableBills(buyer));
    setIsLoading(false);
  }

  const lines = bill
    ? bill.items
        .map((i) => ({ item: i, quantity: Number(quantities[i.id]) || 0 }))
        .filter((l) => l.quantity > 0)
    : [];
  const amount = round2(lines.reduce((s, l) => s + l.quantity * l.item.netUnitPrice, 0));
  const paidTotal = bill ? bill.paid.cash + bill.paid.account + bill.paid.credit : 0;
  const cashBack = paidTotal > 0 && bill ? round2((amount * bill.paid.cash) / paidTotal) : amount;
  const bankBack = paidTotal > 0 && bill ? round2((amount * bill.paid.account) / paidTotal) : 0;
  const udhaarOff = round2(amount - cashBack - bankBack);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bill) return;
    setIsSaving(true);
    setError(null);
    const result = await createSaleReturn({
      dailySaleId: bill.dailySaleId,
      visitAt: new Date(bill.visitAt),
      items: lines.map((l) => ({ dailySaleItemId: l.item.id, quantity: l.quantity })),
      returnDate,
      reference,
      notes: notes || undefined,
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(`Sales return saved — ${formatMoney(result.data.amount)}`);
    setReference("");
    setNotes("");
    // What's still returnable on the bill has changed.
    const keep = billKey;
    await loadBills(buyerKind === "CUSTOMER" ? { customerId } : { dealerId });
    setBillKey(keep);
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Returned by</label>
        <div className="stock-toggle">
          <button
            type="button"
            className={buyerKind === "CUSTOMER" ? "active" : ""}
            onClick={() => {
              setBuyerKind("CUSTOMER");
              void loadBills({ customerId });
            }}
          >
            Customer
          </button>
          <button
            type="button"
            className={buyerKind === "DEALER" ? "active" : ""}
            onClick={() => {
              setBuyerKind("DEALER");
              void loadBills({ dealerId });
            }}
          >
            Dealer
          </button>
        </div>
      </div>

      {buyerKind === "CUSTOMER" ? (
        <CustomerPicker
          areas={areas}
          initial={initialCustomer}
          onChange={(s) => {
            const id = s?.mode === "existing" ? s.customerId : "";
            setCustomerId(id);
            void loadBills({ customerId: id });
          }}
        />
      ) : (
        <DealerPicker
          dealers={dealers}
          value={dealerId}
          onChange={(id) => {
            setDealerId(id);
            void loadBills({ dealerId: id });
          }}
        />
      )}

      <div className="field">
        <label>Bill</label>
        {isLoading ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5, margin: 0 }}>Loading bills…</p>
        ) : bills.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5, margin: 0 }}>Pick who is returning to see their bills.</p>
        ) : (
          <select
            value={billKey}
            onChange={(e) => {
              setBillKey(e.target.value);
              setQuantities({});
            }}
            required
          >
            <option value="" disabled>
              Select the bill
            </option>
            {bills.map((b) => (
              <option key={keyOf(b)} value={keyOf(b)}>
                {formatDate(b.visitAt)}
                {b.receiptNumber ? ` · Receipt #${b.receiptNumber}` : ""} · {formatMoney(b.total)} ·{" "}
                {b.items.map((i) => i.productName.trim()).join(", ")}
              </option>
            ))}
          </select>
        )}
      </div>

      {bill && (
        <>
          <div className="panel" style={{ marginBottom: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ textAlign: "right" }}>Bought</th>
                  <th style={{ textAlign: "right" }}>Already returned</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ width: 170 }}>Returning now</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.productName}</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {i.quantity} {i.unitName}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {i.returned > 0 ? `${i.returned} ${i.unitName}` : "—"}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatMoney(i.netUnitPrice)}
                    </td>
                    <td>
                      {i.remaining > 0 ? (
                        <input
                          type="number"
                          min="0"
                          max={i.remaining}
                          step="any"
                          placeholder={`up to ${i.remaining}`}
                          value={quantities[i.id] ?? ""}
                          onChange={(e) => setQuantities({ ...quantities, [i.id]: e.target.value })}
                        />
                      ) : (
                        <span style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>All returned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {amount > 0 && (
            <div className="bill-summary">
              <div className="bill-summary-row">
                <span>Returned goods worth</span>
                <strong className="num">{formatMoney(amount)}</strong>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                Goes back the way the bill was paid:
                {cashBack > 0 && <> Rs {cashBack.toLocaleString("en-US")} cash</>}
                {bankBack > 0 && <>{cashBack > 0 ? " ·" : ""} Rs {bankBack.toLocaleString("en-US")} to bank</>}
                {udhaarOff > 0.004 && (
                  <>
                    {cashBack > 0 || bankBack > 0 ? " ·" : ""} Rs {udhaarOff.toLocaleString("en-US")} off Udhaar
                  </>
                )}
              </p>
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required />
            </div>
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
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={isSaving || amount <= 0}>
              {isSaving ? "Saving…" : "Save sales return"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
