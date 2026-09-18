"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";
import { getCustomerUdhaarSummary } from "@/modules/debts/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { RecordAccountTransactionModal } from "@/modules/customers/components/RecordAccountTransactionModal";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import type { DebtRow } from "@/modules/debts/schema";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
type AccountType = Awaited<ReturnType<typeof listAccountTypes>>[number];
type ExistingCustomer = ReturnType<typeof useCustomers>["customers"][number];

// Search a customer by name/phone plus area/account-type filters (the
// same filter shape Customers/Daily Sales already use), then show
// their Udhaar borrowed/paid/remaining and a "Record payment" action
// — the shopkeeper's dedicated screen for clearing a loan without
// needing to open the customer's own profile page.
export function UdhaarClearanceForm({ areas, accountTypes }: { areas: Area[]; accountTypes: AccountType[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [areaId, setAreaId] = useState("");
  const [accountTypeId, setAccountTypeId] = useState("");
  const [selected, setSelected] = useState<ExistingCustomer | null>(null);
  const [summary, setSummary] = useState<DebtRow | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const { customers, isLoading } = useCustomers(
    query.length >= 2 ? query : undefined,
    areaId || undefined,
    accountTypeId || undefined
  );

  async function selectCustomer(customer: ExistingCustomer) {
    setSelected(customer);
    setIsLoadingSummary(true);
    try {
      const result = await getCustomerUdhaarSummary(customer.id);
      setSummary(result);
    } finally {
      setIsLoadingSummary(false);
    }
  }

  function clearSelection() {
    setSelected(null);
    setSummary(null);
    setQuery("");
  }

  async function refreshSummary() {
    if (!selected) return;
    const result = await getCustomerUdhaarSummary(selected.id);
    setSummary(result);
    router.refresh();
  }

  if (selected) {
    return (
      <div>
        <button type="button" className="btn btn-ghost" onClick={clearSelection} style={{ marginBottom: 16 }}>
          <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Search a different customer
        </button>

        <div className="cust-header" style={{ marginBottom: 20 }}>
          <div className="cust-avatar-lg">{selected.name.charAt(0).toUpperCase()}</div>
          <div>
            <h1 style={{ fontSize: 20 }}>{selected.name}</h1>
            <p>{selected.phone || "No phone"}</p>
          </div>
        </div>

        {isLoadingSummary ? (
          <p style={{ color: "var(--ink-muted)" }}>Loading Udhaar summary…</p>
        ) : !summary ? (
          <div className="panel">
            <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
              This customer has no Udhaar activity yet — nothing to clear.
            </p>
          </div>
        ) : (
          <>
            <div className="stat-grid customers-stat-grid" style={{ marginBottom: 20 }}>
              <div className="stat-card">
                <p className="stat-label">Total borrowed</p>
                <p className="stat-value">{formatMoney(summary.totalBorrowed)}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Total cleared</p>
                <p className="stat-value tone-primary">{formatMoney(summary.totalPaid)}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Remaining</p>
                <p
                  className="stat-value"
                  style={{ color: summary.balance > 0 ? "var(--consigned-600)" : "var(--primary-600)" }}
                >
                  {formatMoney(summary.balance)}
                </p>
              </div>
            </div>

            {summary.balance > 0 ? (
              <RecordPaymentButton customerAccountId={summary.customerAccountId} onRecorded={refreshSummary} />
            ) : (
              <p style={{ color: "var(--primary-600)", fontWeight: 500 }}>
                Fully cleared — nothing outstanding on this account.
              </p>
            )}

            <p style={{ marginTop: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>
              Udhaar since {formatDate(summary.debtSince)} ({summary.daysSince} day
              {summary.daysSince === 1 ? "" : "s"} ago)
              {summary.dueDate && <> · Due {formatDate(summary.dueDate)}</>}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="field-row">
        <div className="field" style={{ flex: 1 }}>
          <label>Search by name or phone</label>
          <input
            type="text"
            placeholder="Type at least 2 characters…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Area</label>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Account type</label>
          <select value={accountTypeId} onChange={(e) => setAccountTypeId(e.target.value)}>
            <option value="">All account types</option>
            {accountTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(query.length >= 2 || areaId || accountTypeId) && (
        <div className="panel" style={{ overflow: "hidden", marginTop: 8 }}>
          {isLoading ? (
            <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>Searching…</p>
          ) : customers.length === 0 ? (
            <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>No customers match.</p>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCustomer(c)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
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
    </div>
  );
}

// A local trigger button rather than RecordAccountTransactionModal's
// own built-in one, so saving can also refresh THIS tab's already-
// fetched summary state — the modal's router.refresh() alone doesn't
// re-run a client component's local state.
function RecordPaymentButton({
  customerAccountId,
  onRecorded,
}: {
  customerAccountId: string;
  onRecorded: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Record payment
      </button>
      {open && (
        <RecordAccountTransactionModal
          customerAccountId={customerAccountId}
          defaultDirection="IN"
          onClose={() => {
            setOpen(false);
            onRecorded();
          }}
        />
      )}
    </>
  );
}
