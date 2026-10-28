"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  deleteGrainPickup,
  deleteHomeGrainImport,
  updateHomeGrainImport,
  type HomeGrainRow,
} from "../homeGrain.actions";
import { PickupGrainModal } from "./PickupGrainModal";
import { EditGrainSettlementModal } from "./EditGrainSettlementModal";
import { DeleteGrainSettlementButton } from "./DeleteGrainSettlementButton";
import { showToast } from "@/components/shared/toastStore";
import { formatDate, formatMoney } from "@/lib/utils";
import type { AdvanceRegisterRow } from "@/modules/grain-register/actions";
import { AdvanceRegisterActions, RegisterBadge } from "@/modules/grain-register/components/AdvanceRegisterActions";

const PAY_LABEL = { CASH: "Cash", ACCOUNT: "Bank", CREDIT: "Udhaar" } as const;
const PAY_CLASS = { CASH: "pay-cash", ACCOUNT: "pay-account", CREDIT: "pay-credit" } as const;

// Grain the shop bought that was left at the seller's home: what was
// bought and paid, what's been picked up (each trip listed under the
// row, editable), what was delivered from there straight to a buyer,
// and what's still there — with Pick up, Edit and Delete purchase.
export function HomeGrainRecords({
  rows,
  showCustomer = true,
  showProduct = false,
  bankAccounts = [],
  emptyText = "No grain bought that's still at a customer's home.",
  onChanged,
  registerRows = [],
  registerGrains = [],
}: {
  rows: HomeGrainRow[];
  showCustomer?: boolean;
  showProduct?: boolean;
  bankAccounts?: { id: string; name: string }[];
  emptyText?: string;
  // For a caller holding its own fetched rows (Buy/Keep stock) — called
  // after any pickup / purchase change; pages just refresh.
  onChanged?: () => void;
  // Advance stock entries from the register (customer page) — listed
  // among the records, newest first, marked "From register".
  registerRows?: AdvanceRegisterRow[];
  registerGrains?: { id: string; name: string }[];
}) {
  const [openTrips, setOpenTrips] = useState<string | null>(null);
  const [editing, setEditing] = useState<HomeGrainRow | null>(null);
  const columns = 8 + (showCustomer ? 1 : 0) + (showProduct ? 1 : 0);
  const items = [
    ...rows.map((r) => ({ kind: "record" as const, date: new Date(r.date).getTime(), r })),
    ...registerRows.map((e) => ({ kind: "register" as const, date: new Date(e.date).getTime(), e })),
  ].sort((a, b) => b.date - a.date);

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {showCustomer && <th>At the home of</th>}
            {showProduct && <th>Grain</th>}
            <th style={{ textAlign: "right" }}>Quantity</th>
            <th style={{ textAlign: "right" }}>Rate</th>
            <th style={{ textAlign: "right" }}>Paid</th>
            <th style={{ textAlign: "right" }}>Picked up</th>
            <th>Sold from home to</th>
            <th style={{ textAlign: "right" }}>Remaining</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={columns}>{emptyText}</td>
            </tr>
          ) : (
            items.map((item) => {
              if (item.kind === "register") {
                const e = item.e;
                return (
                  <tr key={e.id}>
                    <td>
                      {formatDate(e.date)}
                      {e.note && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)" }}>{e.note}</span>
                      )}
                    </td>
                    {showCustomer && <td></td>}
                    {showProduct && <td>{e.productName}</td>}
                    <td className="num" style={{ textAlign: "right" }}>
                      {e.kg} {e.unitName}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      <span className="dash">—</span>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      <RegisterBadge />
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      —
                    </td>
                    <td style={{ fontSize: 13 }}>—</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--grain-600)" }}>
                      {e.kg} {e.unitName}
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                        <AdvanceRegisterActions row={e} grains={registerGrains} />
                      </div>
                    </td>
                  </tr>
                );
              }
              const r = item.r;
              return (
              <Fragment key={r.id}>
                <tr>
                  <td>
                    {formatDate(r.date)}
                    {r.reference && (
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)" }}>Ref: {r.reference}</span>
                    )}
                  </td>
                  {showCustomer && (
                    <td>
                      <Link href={`/dashboard/customers/${r.customer.id}`} className="name-link">
                        {r.customer.name}
                      </Link>
                    </td>
                  )}
                  {showProduct && <td>{r.product.name}</td>}
                  <td className="num" style={{ textAlign: "right" }}>
                    {r.quantity} {r.unitName}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {r.accountTransactionId ? formatMoney(r.rate) : <span className="dash">—</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {/* Quantity only — its rate and value were settled in the
                        past, before it was recorded here (see HOME_GRAIN_RATES_ENABLED). */}
                    {r.accountTransactionId ? (
                      formatMoney(r.amount)
                    ) : (
                      <span className="pay-badge pay-cash" title="Paid and valued in the past — only the quantity is recorded here">
                        Rate already set
                      </span>
                    )}
                    {r.paymentMethod && (
                      <span className={`pay-badge ${PAY_CLASS[r.paymentMethod]}`} style={{ marginLeft: 6 }}>
                        {PAY_LABEL[r.paymentMethod]}
                      </span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {r.pickups.length > 0 ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setOpenTrips(openTrips === r.id ? null : r.id)}
                        title="Show trips"
                      >
                        {r.pickedUp} {r.unitName} · {r.pickups.length} trip{r.pickups.length === 1 ? "" : "s"}{" "}
                        {openTrips === r.id ? "▴" : "▾"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {r.soldTo.length === 0
                      ? "—"
                      : r.soldTo.map((t, k) => (
                          <span key={k} style={{ display: "block", whiteSpace: "nowrap" }}>
                            <span className="num">
                              {t.quantity} {r.unitName}
                            </span>{" "}
                            →{" "}
                            <Link href={t.href} className="name-link">
                              {t.name}
                            </Link>{" "}
                            <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{formatDate(t.date)}</span>
                          </span>
                        ))}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {r.remaining > 0 ? (
                      <span style={{ color: "var(--grain-600)" }}>
                        {r.remaining} {r.unitName}
                      </span>
                    ) : (
                      <span className="pay-badge pay-cash">All picked up</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      {r.remaining > 0 && (
                        <PickupGrainModal
                          grainBatchId={r.id}
                          customerName={r.customer.name}
                          productName={r.product.name}
                          remaining={r.remaining}
                          unitName={r.unitName}
                          onDone={onChanged}
                        />
                      )}
                      {r.accountTransactionId && (
                        <>
                          <button className="icon-btn" onClick={() => setEditing(r)} title="Edit purchase">
                            <svg className="icon" viewBox="0 0 24 24">
                              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                            </svg>
                          </button>
                          <DeleteGrainSettlementButton accountTransactionId={r.accountTransactionId} onDeleted={onChanged} />
                        </>
                      )}
                      {!r.accountTransactionId && (
                        <>
                          <EditHomeGrainButton row={r} onDone={onChanged} />
                          <DeleteHomeGrainButton id={r.id} onDone={onChanged} />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {openTrips === r.id &&
                  r.pickups.map((p, i) => (
                    <tr key={p.id} className="sub-row">
                      <td colSpan={columns - 4} style={{ paddingLeft: 28, fontSize: 13, color: "var(--ink-muted)" }}>
                        Trip {i + 1} · {formatDate(p.date)} · Ref: {p.reference}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </td>
                      <td className="num" style={{ textAlign: "right", fontSize: 13 }}>
                        {p.quantity} {r.unitName}
                      </td>
                      <td colSpan={2}></td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                          <PickupGrainModal
                            grainBatchId={r.id}
                            customerName={r.customer.name}
                            productName={r.product.name}
                            remaining={r.remaining}
                            unitName={r.unitName}
                            existing={p}
                            onDone={onChanged}
                          />
                          <DeletePickupButton id={p.id} onDone={onChanged} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </Fragment>
              );
            })
          )}
        </tbody>
      </table>

      {editing && editing.accountTransactionId && (
        <EditGrainSettlementModal
          accountTransactionId={editing.accountTransactionId}
          initialQuantity={editing.quantity}
          initialRate={editing.rate}
          initialPaymentMethod={editing.paymentMethod}
          unitName={editing.unitName}
          bankAccounts={bankAccounts}
          onClose={() => {
            setEditing(null);
            onChanged?.();
          }}
        />
      )}
    </>
  );
}

// Deleting a trip puts its grain back at the customer's home.
function DeletePickupButton({ id, onDone }: { id: string; onDone?: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteGrainPickup(id);
    setIsDeleting(false);
    setConfirming(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Pickup deleted — that grain is back at the customer's home");
    router.refresh();
    onDone?.();
  }

  if (confirming) {
    return (
      <>
        <span style={{ fontSize: 12.5, color: "var(--consigned-600)" }}>Put it back at their home?</span>
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
      <button className="icon-btn" onClick={() => setConfirming(true)} title="Delete pickup">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
        </svg>
      </button>
    </>
  );
}

// Editing a quantity-only entry: how much is (or was) at their home,
// and its reference.
function EditHomeGrainButton({ row, onDone }: { row: HomeGrainRow; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const leftHome = Math.round((row.quantity - row.remaining) * 1000) / 1000;

  function openModal() {
    setQuantity(String(row.quantity));
    setReference(row.reference ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await updateHomeGrainImport({ id: row.id, quantity: Number(quantity), reference });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Updated");
    setOpen(false);
    router.refresh();
    onDone?.();
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
            <h2>Edit grain at {row.customer.name}&apos;s home</h2>
            <p className="modal-sub">
              {row.product.name}
              {leftHome > 0 ? ` — ${leftHome} ${row.unitName} has already left their home, so it can't be less than that.` : "."}
            </p>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="field-row">
                <div className="field">
                  <label>Quantity ({row.unitName})</label>
                  <input
                    type="number"
                    step="any"
                    min={leftHome}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Reference</label>
                  <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} required />
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

function DeleteHomeGrainButton({ id, onDone }: { id: string; onDone?: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteHomeGrainImport(id);
    setIsDeleting(false);
    setConfirming(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Deleted");
    router.refresh();
    onDone?.();
  }

  if (confirming) {
    return (
      <>
        <span style={{ fontSize: 12.5, color: "var(--consigned-600)" }}>Delete this record?</span>
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
