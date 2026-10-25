"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recordCustomerUdhaarPayment, payShopUdhaar } from "../actions";
import { getCustomerUdhaarLedger, getShopOwesCustomerLedger } from "@/modules/debts/actions";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney, formatDate } from "@/lib/utils";
import type { UdhaarChargeKind, ShopOwesChargeKind } from "@/modules/debts/udhaarLedger";

type Side = "CUSTOMER" | "SHOP";

// One row of the entry list, whichever side it's from.
type Entry = {
  id: string;
  date: Date;
  label: string;
  detail: string | null;
  amount: number;
  paid: number;
  remaining: number;
  isOverdue: boolean;
};

type Ledger = { entries: Entry[]; totalCharged: number; totalPaid: number; balance: number; unapplied: number };

const CUSTOMER_KIND_LABEL: Record<UdhaarChargeKind, string> = {
  SALE: "Sale on Udhaar",
  IMPORTED: "Imported",
  LONG_TERM: "Long-term loan",
  GIVEN: "Udhaar given",
};

const SHOP_KIND_LABEL: Record<ShopOwesChargeKind, string> = {
  BORROWED: "Borrowed from customer",
  IMPORTED: "Imported",
  GRAIN: "Grain bought on Udhaar",
};

const COPY = {
  CUSTOMER: {
    total: "Total Udhaar",
    paid: "Paid",
    owes: "Customer owes",
    amount: "Amount received",
    method: "Received as",
    button: "Record payment",
    toast: "Udhaar payment recorded",
    nothing: "This customer doesn't owe the shop anything right now.",
    advance: "paid in advance — it will count against this customer's next Udhaar.",
  },
  SHOP: {
    total: "Shop owes (total)",
    paid: "Repaid",
    owes: "Shop still owes",
    amount: "Amount paid to customer",
    method: "Paid as",
    button: "Record repayment",
    toast: "Repayment recorded",
    nothing: "The shop doesn't owe this customer anything right now.",
    advance: "repaid in advance — it will count against what the shop next owes this customer.",
  },
} as const;

async function loadLedger(side: Side, customerId: string): Promise<Ledger | null> {
  if (side === "CUSTOMER") {
    const l = await getCustomerUdhaarLedger(customerId);
    if (!l) return null;
    return {
      ...l,
      entries: l.charges.map((c) => ({
        id: c.id,
        date: c.date,
        label: CUSTOMER_KIND_LABEL[c.kind],
        detail: c.kind === "SALE" ? c.description : c.reference ? `Ref: ${c.reference}` : null,
        amount: c.amount,
        paid: c.paid,
        remaining: c.remaining,
        isOverdue: c.isOverdue,
      })),
    };
  }
  const l = await getShopOwesCustomerLedger(customerId);
  if (!l) return null;
  return {
    ...l,
    entries: l.charges.map((c) => ({
      id: c.id,
      date: c.date,
      label: SHOP_KIND_LABEL[c.kind],
      detail: c.kind === "GRAIN" ? c.description : c.reference ? `Ref: ${c.reference}` : null,
      amount: c.amount,
      paid: c.paid,
      remaining: c.remaining,
      isOverdue: c.isOverdue,
    })),
  };
}

// Udhaar clearance as ONE payment, in either direction: the customer
// paying the shop (side CUSTOMER) or the shop paying the customer back
// (side SHOP). The shopkeeper enters the total; it's spread over every
// entry below, oldest first (debts/udhaarLedger.ts) — nothing is paid
// per entry. Loads the ledger on mount (this panel only exists once a
// customer has been picked inside a popup/form, so there's no page
// render to fetch it during), and re-reads it plus router.refresh()
// after each payment.
function UdhaarPaymentPanel({
  side,
  customerId,
  bankAccounts,
  onRecorded,
}: {
  side: Side;
  customerId: string;
  bankAccounts: { id: string; name: string }[];
  onRecorded?: () => void;
}) {
  const router = useRouter();
  const copy = COPY[side];
  const [ledger, setLedger] = useState<Ledger | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ACCOUNT">("CASH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setLoadError(false);
    try {
      setLedger(await loadLedger(side, customerId));
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, customerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const input = {
        customerId,
        amount: Number(amount),
        paymentMethod,
        bankAccountId: bankAccountId || undefined,
        notes: notes || undefined,
      };
      const result = side === "CUSTOMER" ? await recordCustomerUdhaarPayment(input) : await payShopUdhaar(input);
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(`${copy.toast} — ${formatMoney(Number(amount))}`);
      setAmount("");
      setNotes("");
      await load();
      router.refresh();
      onRecorded?.();
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) {
    return (
      <p className="form-banner error">
        Couldn&apos;t load this customer&apos;s Udhaar.{" "}
        <button type="button" className="btn btn-ghost" onClick={load}>
          Retry
        </button>
      </p>
    );
  }
  if (ledger === undefined) return <p style={{ color: "var(--ink-muted)" }}>Loading Udhaar…</p>;

  const owed = ledger?.balance ?? 0;
  const entries = ledger?.entries ?? [];
  // The cards count only entries still open, so once everything is
  // cleared they all read Rs 0; fully paid entries stay listed below
  // as history.
  const openEntries = entries.filter((e) => e.remaining > 0.01);
  const openTotal = openEntries.reduce((sum, e) => sum + e.amount, 0);
  const openPaid = openEntries.reduce((sum, e) => sum + e.paid, 0);

  return (
    <div>
      <div className="stat-grid customers-stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <p className="stat-label">{copy.total}</p>
          <p className="stat-value">{formatMoney(openTotal)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{copy.paid}</p>
          <p className="stat-value tone-primary">{formatMoney(openPaid)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{copy.owes}</p>
          <p className="stat-value tone-consigned">{formatMoney(owed)}</p>
        </div>
      </div>

      {ledger && ledger.unapplied > 0.01 && (
        <p className="form-banner" style={{ marginBottom: 16 }}>
          {formatMoney(ledger.unapplied)} {copy.advance}
        </p>
      )}

      {owed > 0.01 ? (
        <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          {error && <p className="form-banner error">{error}</p>}
          <div className="field-row">
            <div className="field">
              <label>
                {copy.amount} (max {formatMoney(owed)})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                max={owed}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>{copy.method}</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "ACCOUNT")}>
                <option value="CASH">Cash</option>
                <option value="ACCOUNT">Account/bank</option>
              </select>
            </div>
          </div>
          {paymentMethod === "ACCOUNT" && (
            <BankAccountPicker bankAccounts={bankAccounts} value={bankAccountId} onChange={setBankAccountId} />
          )}
          <div className="field">
            <label>Notes (optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Saving…" : copy.button}
          </button>
        </form>
      ) : (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5, marginBottom: 16 }}>{copy.nothing}</p>
      )}

      {entries.length > 0 && (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Udhaar</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>{copy.paid}</th>
                <th style={{ textAlign: "right" }}>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.date)}</td>
                  <td>
                    {c.label}
                    {c.detail && <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>{c.detail}</div>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(c.amount)}
                  </td>
                  <td className="num" style={{ textAlign: "right", color: "var(--primary-600)" }}>
                    {formatMoney(c.paid)}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatMoney(c.remaining)}
                  </td>
                  <td>
                    {c.remaining <= 0.01 ? (
                      <span className="pay-badge pay-cash">Paid</span>
                    ) : c.paid > 0.01 ? (
                      <span className="pay-badge pay-mixed">Partly paid</span>
                    ) : (
                      <span className="pay-badge pay-credit">{c.isOverdue ? "Overdue" : "Open"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type ModalExtras = {
  triggerLabel?: string;
  // e.g. "btn btn-primary" for a Pay now / Receive button on a balance card.
  triggerClassName?: string;
  // For a caller holding its own client-side data (refetch after a payment).
  onRecorded?: () => void;
};

function UdhaarPaymentModal({
  side,
  customerId,
  customerName,
  bankAccounts,
  triggerLabel,
  triggerClassName = "btn btn-ghost",
  onRecorded,
}: {
  side: Side;
  customerId: string;
  customerName: string;
  bankAccounts: { id: string; name: string }[];
} & ModalExtras & { triggerLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 760, padding: 28 }}>
            <h2>
              {side === "CUSTOMER" ? "Udhaar" : "Shop owes"} — {customerName}
            </h2>
            <div style={{ marginTop: 12 }}>
              <UdhaarPaymentPanel
                side={side}
                customerId={customerId}
                bankAccounts={bankAccounts}
                onRecorded={onRecorded}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// What the customer owes the shop, cleared by one payment.
export function CustomerUdhaarPaymentPanel(props: {
  customerId: string;
  bankAccounts: { id: string; name: string }[];
  onRecorded?: () => void;
}) {
  return <UdhaarPaymentPanel side="CUSTOMER" {...props} />;
}

// What the shop owes the customer, repaid by one payment.
export function ShopUdhaarPaymentPanel(props: {
  customerId: string;
  bankAccounts: { id: string; name: string }[];
  onRecorded?: () => void;
}) {
  return <UdhaarPaymentPanel side="SHOP" {...props} />;
}

// The Udhaar page's per-customer "Record repayment" buttons.
export function CustomerUdhaarPaymentModal(
  props: {
    customerId: string;
    customerName: string;
    bankAccounts: { id: string; name: string }[];
  } & ModalExtras
) {
  return <UdhaarPaymentModal side="CUSTOMER" {...props} triggerLabel={props.triggerLabel ?? "Record repayment"} />;
}

export function ShopUdhaarPaymentModal(
  props: {
    customerId: string;
    customerName: string;
    bankAccounts: { id: string; name: string }[];
  } & ModalExtras
) {
  return <UdhaarPaymentModal side="SHOP" {...props} triggerLabel={props.triggerLabel ?? "Record repayment"} />;
}
