"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createGrainLoan,
  updateGrainLoan,
  type GrainLoanRow,
} from "../actions";
import { createCustomer } from "@/modules/customers/actions";
import {
  CustomerPicker,
  type CustomerSelection,
} from "@/modules/daily-sales/components/CustomerPicker";
import { showToast } from "@/components/shared/toastStore";
import { toLocalDateString } from "@/lib/utils";
import type { listAreas } from "@/modules/settings/areas.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
type Direction = "SHOP_LENT" | "SHOP_BORROWED";
export type LoanParty = {
  kind: "CUSTOMER" | "DEALER";
  id: string;
  name: string;
};

// Record a grain loan — or fully edit one (pass `loan`). Two direction
// tabs (Shop lends / Shop borrows), then who, how much, and the agreed
// rate at the time.
// The party is picked here on the Grain page, or fixed when opened from
// a customer's or dealer's own page (fixedParty); the grain is fixed
// on the Grain page (productId) or picked from `products` elsewhere.
type GrainLoanModalProps = {
  loan?: GrainLoanRow;
  productId?: string;
  products?: { id: string; name: string }[];
  fixedParty?: LoanParty;
  areas?: Area[];
  dealers?: { id: string; name: string }[];
  unitName?: string;
  trigger?: "button" | "icon";
};

export function GrainLoanModal(props: GrainLoanModalProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {props.trigger === "icon" ? (
        <button className="icon-btn" onClick={() => setOpen(true)} title="Edit">
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      ) : (
        <button className="btn btn-ghost" onClick={() => setOpen(true)}>
          <svg
            className="icon"
            viewBox="0 0 24 24"
            style={{ width: 14, height: 14 }}
          >
            <path d="M7 7h11l-3-3M17 17H6l3 3" />
          </svg>
          Grain loan
        </button>
      )}
      {/* Mounted only while open, so an edit always starts from the latest row. */}
      {open && <GrainLoanDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

// The same form on the page itself rather than in a pop-up — the New
// entry screen's Grain loan tile. onSaved runs after a save (ready for
// the next one); onCancel leaves.
export function GrainLoanForm(
  props: Omit<GrainLoanModalProps, "loan" | "trigger"> & {
    onSaved: () => void;
    onCancel: () => void;
  },
) {
  return (
    <GrainLoanDialog
      {...props}
      inline
      onClose={props.onSaved}
      onCancel={props.onCancel}
    />
  );
}

function GrainLoanDialog({
  loan,
  productId,
  products = [],
  fixedParty,
  areas = [],
  dealers = [],
  unitName,
  onClose,
  inline = false,
  onCancel,
}: GrainLoanModalProps & {
  onClose: () => void;
  inline?: boolean;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = !!loan;

  const initialParty: LoanParty | undefined =
    fixedParty ??
    (loan
      ? { kind: loan.party.kind, id: loan.party.id, name: loan.party.name }
      : undefined);

  const [direction, setDirection] = useState<Direction>(
    loan?.direction ?? "SHOP_LENT",
  );
  const [partyKind, setPartyKind] = useState<"CUSTOMER" | "DEALER">(
    initialParty?.kind ?? "CUSTOMER",
  );
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const [dealerId, setDealerId] = useState(
    initialParty?.kind === "DEALER" ? initialParty.id : "",
  );
  const [pickedProductId, setPickedProductId] = useState(
    loan?.productId ?? productId ?? products[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState(loan ? String(loan.quantity) : "");
  const [rate, setRate] = useState(loan ? String(loan.rate) : "");
  const [loanDate, setLoanDate] = useState(
    toLocalDateString(loan ? new Date(loan.loanDate) : new Date()),
  );
  const [reference, setReference] = useState(loan?.reference ?? "");
  const [notes, setNotes] = useState(loan?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // While editing, the picker only opens if the user wants a different customer.
  const [changeCustomer, setChangeCustomer] = useState(false);

  const total = (Number(quantity) || 0) * (Number(rate) || 0);
  const lockGrainAndDirection = editing && loan.returns.length > 0;

  async function resolvePartyIds(): Promise<
    { customerId?: string; dealerId?: string } | string
  > {
    if (fixedParty)
      return fixedParty.kind === "CUSTOMER"
        ? { customerId: fixedParty.id }
        : { dealerId: fixedParty.id };
    if (partyKind === "DEALER")
      return dealerId ? { dealerId } : "Select a dealer";
    if (editing && !changeCustomer && loan.party.kind === "CUSTOMER")
      return { customerId: loan.party.id };
    if (!customer) return "Select a customer";
    if (customer.mode === "existing")
      return { customerId: customer.customerId };
    const created = await createCustomer({
      name: customer.name,
      phone: customer.phone,
      areaId: customer.areaId,
      accountTypeIds: customer.accountTypeIds,
    });
    return { customerId: created.id };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const party = await resolvePartyIds();
      if (typeof party === "string") {
        setError(party);
        return;
      }
      const payload = {
        direction,
        productId: pickedProductId,
        ...party,
        quantity: Number(quantity),
        rate: Number(rate),
        loanDate,
        reference,
        notes: notes || undefined,
      };
      const result = editing
        ? await updateGrainLoan({ id: loan.id, ...payload })
        : await createGrainLoan(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(
        editing
          ? "Grain loan updated"
          : direction === "SHOP_LENT"
            ? "Grain lent"
            : "Grain borrowed",
      );
      close();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  const close = onClose;
  const unit = unitName ?? loan?.unitName ?? "";

  const content = (
    <>
      {!inline && <h2>{editing ? "Edit grain loan" : "Grain loan"}</h2>}

      <div className="tabs" style={{ marginTop: 12, marginBottom: 16 }}>
        {(["SHOP_LENT", "SHOP_BORROWED"] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={`tab${direction === d ? " active" : ""}`}
            onClick={() => !lockGrainAndDirection && setDirection(d)}
            disabled={lockGrainAndDirection && direction !== d}
          >
            {d === "SHOP_LENT" ? "Shop lends grain" : "Shop borrows grain"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {error && <p className="form-banner error">{error}</p>}

        {fixedParty ? (
          <div className="field">
            <label>
              {direction === "SHOP_LENT" ? "Lent to" : "Borrowed from"}
            </label>
            <input type="text" value={fixedParty.name} disabled />
          </div>
        ) : (
          <>
            <div className="field">
              <div className="stock-toggle">
                {(["CUSTOMER", "DEALER"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={partyKind === k ? "active" : ""}
                    onClick={() => setPartyKind(k)}
                  >
                    {k === "CUSTOMER" ? "Customer" : "Dealer"}
                  </button>
                ))}
              </div>
            </div>
            {partyKind === "CUSTOMER" ? (
              editing && loan.party.kind === "CUSTOMER" && !changeCustomer ? (
                <div className="field">
                  <label>
                    {direction === "SHOP_LENT" ? "Lent to" : "Borrowed from"}
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={loan.party.name}
                      disabled
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setChangeCustomer(true)}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <CustomerPicker areas={areas} onChange={setCustomer} />
              )
            ) : (
              <div className="field">
                <label>Dealer</label>
                <select
                  value={dealerId}
                  onChange={(e) => setDealerId(e.target.value)}
                  required
                >
                  <option value="">Select a dealer…</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {products.length > 0 && (
          <div className="field">
            <label>Grain</label>
            <select
              value={pickedProductId}
              onChange={(e) => setPickedProductId(e.target.value)}
              disabled={lockGrainAndDirection}
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label>Quantity{unit ? ` (${unit})` : ""}</label>
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Agreed rate{unit ? ` (per ${unit})` : ""}</label>
            <input
              type="number"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={loanDate}
              onChange={(e) => setLoanDate(e.target.value)}
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

        {total > 0 && (
          <div className="settlement-summary">
            <div>
              <span>Worth at agreed rate</span>
              <strong>Rs {total.toLocaleString()}</strong>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving
              ? "Saving…"
              : editing
                ? "Save changes"
                : direction === "SHOP_LENT"
                  ? "Lend grain"
                  : "Borrow grain"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel ?? close}
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  );

  if (inline) return content;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640 }}
      >
        {content}
      </div>
    </div>
  );
}
