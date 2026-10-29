"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGrainWaste, deleteGrainWaste, updateGrainWaste, type GrainWasteRow } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatDate, formatMoney, toLocalDateString } from "@/lib/utils";

type Shelf = {
  productName: string;
  unitName: string;
  kg: number;
  value: number;
  rate: number;
  // Customers' grain on the shelf — what waste beyond the shop's own
  // comes out of — and the rate it's owed back at.
  customerKg: number;
  customerRate: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
// A per-kg cost, to the paisa (the change per kg is often under a rupee).
const perKg = (n: number) => `Rs ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The Waste grain tab: the shop's own grain on the shelf, a form to
// mark some as waste with a live before → after (the cost stays, so the
// cost per kg goes up; beyond the shop's own it's customers' grain, owed
// back as Stock Udhaar), and the waste recorded so far.
export function WasteGrainPanel({ productId, shelf, rows }: { productId: string; shelf: Shelf; rows: GrainWasteRow[] }) {
  const unit = shelf.unitName;
  return (
    <>
      <div className="stat-grid" style={{ margin: "16px 0" }}>
        <div className="stat-card">
          <p className="stat-label">Own stock on the shelf</p>
          <p className="stat-value tone-primary">
            {shelf.kg} {unit}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">What it cost (stock value)</p>
          <p className="stat-value">{formatMoney(shelf.value)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Cost per {unit}</p>
          <p className="stat-value tone-grain">{perKg(shelf.rate)}</p>
        </div>
      </div>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 14px" }}>Mark {shelf.productName} as waste</h3>
        <WasteForm productId={productId} shelf={shelf} />
      </section>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th style={{ textAlign: "right" }}>Wasted</th>
              <th style={{ textAlign: "right" }}>Stock before → after</th>
              <th style={{ textAlign: "right" }}>Cost per {unit} before → after</th>
              <th>Reference</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={6}>No waste recorded for {shelf.productName}.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--consigned-600)" }}>
                    {r.quantity} {unit}
                    {r.fromCustomersKg > 0 && (
                      <span style={{ display: "block", fontSize: 12, fontWeight: 400 }}>
                        incl. {r.fromCustomersKg} {unit} customers&apos; → Stock Udhaar
                      </span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {r.kgBefore} → {r.kgAfter} {unit}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {perKg(r.rateBefore)} → {r.rateAfter !== null ? perKg(r.rateAfter) : "— (all wasted)"}
                  </td>
                  <td>
                    {r.reference}
                    {r.notes && <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)" }}>{r.notes}</span>}
                  </td>
                  <td>
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      {r.locked ? (
                        <span style={{ fontSize: 12, color: "var(--ink-muted)" }} title="The grain left after it has been sold or used since">
                          Grain since sold
                        </span>
                      ) : (
                        <>
                          <EditWasteButton row={r} unit={unit} shelfKg={shelf.kg + shelf.customerKg} />
                          <DeleteWasteButton id={r.id} />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function WasteForm({ productId, shelf }: { productId: string; shelf: Shelf }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("");
  const [wasteDate, setWasteDate] = useState(toLocalDateString(new Date()));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const unit = shelf.unitName;
  const q = Number(quantity) || 0;
  const most = round3(shelf.kg + shelf.customerKg);
  // The shop's own grain goes first; anything beyond it is customers'.
  const ownPart = round3(Math.min(q, shelf.kg));
  const customerPart = round3(q - ownPart);
  const left = round3(shelf.kg - ownPart);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await createGrainWaste({ productId, quantity: q, wasteDate, reference, notes: notes || undefined });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(`${q} ${unit} ${shelf.productName} marked as waste`);
    setQuantity("");
    setReference("");
    setNotes("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}
      <div className="field-row">
        <div className="field">
          <label>
            Quantity wasted ({unit}) — up to {most}
            {shelf.customerKg > 0 && ` (${shelf.kg} own + ${shelf.customerKg} customers')`}
          </label>
          <input
            type="number"
            min="0"
            max={most}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            disabled={most <= 0}
          />
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={wasteDate} onChange={(e) => setWasteDate(e.target.value)} required />
        </div>
      </div>
      <div className="field-row">
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
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. got wet, insects" />
        </div>
      </div>

      {q > 0 && q <= most && (
        <div className="bill-summary" style={{ marginBottom: 14 }}>
          {ownPart > 0 && customerPart > 0 && (
            <div className="bill-summary-row">
              <span>From the shop&apos;s own grain</span>
              <strong className="num">
                {ownPart} {unit}
              </strong>
            </div>
          )}
          {ownPart > 0 && (
            <>
            <div className="bill-summary-row">
              <span>Stock</span>
              <strong className="num">
                {shelf.kg} → {left} {unit}
              </strong>
            </div>
            <div className="bill-summary-row">
              <span>Stock value</span>
              <strong className="num">
                {left > 0 ? `${formatMoney(shelf.value)} (stays the same)` : `${formatMoney(shelf.value)} → Rs 0`}
              </strong>
            </div>
            <div className="bill-summary-row">
              <span>Cost per {unit}</span>
              <strong className="num">
                {left > 0
                  ? `${perKg(shelf.rate)} → ${perKg(shelf.value / left)}`
                  : "—"}
              </strong>
            </div>
            </>
          )}
          {ownPart > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-muted)" }}>
              {left > 0
                ? `Profit doesn't change today; each ${unit} left now costs ${perKg(shelf.value / left - shelf.rate)} more, so profit drops by ${formatMoney(round2(ownPart * shelf.rate))} in total as it's sold.`
                : `Nothing is left to carry the cost, so profit drops by ${formatMoney(shelf.value)} right away.`}
            </p>
          )}
          {customerPart > 0 && shelf.customerRate !== null && (
            <>
              <div className="bill-summary-row" style={{ marginTop: 8 }}>
                <span>From customers&apos; grain → Stock Udhaar</span>
                <strong className="num" style={{ color: "var(--consigned-600)" }}>
                  +{customerPart} {unit}
                </strong>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-muted)" }}>
                The shop owes it back: worth {formatMoney(round2(customerPart * shelf.customerRate))} at{" "}
                {perKg(shelf.customerRate)} / {unit} — profit drops by that much now, and buying it back below that rate earns it
                back.
              </p>
            </>
          )}
        </div>
      )}

      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving || q <= 0 || q > most}>
          {isSaving ? "Saving…" : "Mark as waste"}
        </button>
      </div>
    </form>
  );
}

function EditWasteButton({ row, unit, shelfKg }: { row: GrainWasteRow; unit: string; shelfKg: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [wasteDate, setWasteDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Undoing this waste puts its kg back on the shelf first.
  const max = round3(shelfKg + row.quantity);

  function openModal() {
    setQuantity(String(row.quantity));
    setWasteDate(toLocalDateString(new Date(row.date)));
    setReference(row.reference);
    setNotes(row.notes ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await updateGrainWaste({
      id: row.id,
      quantity: Number(quantity),
      wasteDate,
      reference,
      notes: notes || undefined,
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Waste updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="icon-btn" onClick={openModal} title="Edit">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit waste</h2>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>
                    Quantity wasted ({unit}) — up to {max}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={max}
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={wasteDate} onChange={(e) => setWasteDate(e.target.value)} required />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Reference</label>
                  <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Notes (optional)</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save changes"}
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

function DeleteWasteButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteGrainWaste(id);
    setIsDeleting(false);
    setConfirming(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Waste deleted — the grain is back in stock");
    router.refresh();
  }

  if (confirming) {
    return (
      <>
        <span style={{ fontSize: 12.5, color: "var(--consigned-600)" }}>Put it back in stock?</span>
        <button className="btn btn-primary" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={isDeleting}>
          Cancel
        </button>
      </>
    );
  }
  return (
    <>
      {error && <span style={{ fontSize: 12.5, color: "var(--consigned-600)" }}>{error}</span>}
      <button className="icon-btn" onClick={() => setConfirming(true)} title="Delete">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
        </svg>
      </button>
    </>
  );
}
