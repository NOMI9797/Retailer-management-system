"use client";

import { useState } from "react";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";
import type { listAreas } from "@/modules/settings/areas.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
type ExistingCustomer = ReturnType<typeof useCustomers>["customers"][number];

export type CustomerSelection =
  | { mode: "existing"; customerId: string; name: string }
  | { mode: "new"; name: string; phone?: string; areaId?: string; accountTypeIds: string[] };

// Progressive disclosure, per the milestone: type a name, if a match
// exists select it and go straight to line items (the common, fast
// case) — only if nothing matches does the form expand for the rest
// (phone, area), and even then only name is required. No account-type
// picker here — every customer automatically gets a Regular account
// (createCustomer's job), and an Udhaar account is only ever created
// later, on demand, the first time they take a loan or make a Credit
// sale (see applyPaymentSplit). accountTypeIds is still part of
// CustomerSelection's shape for compatibility with createCustomer's
// signature, but this picker always emits an empty array.
export function CustomerPicker({
  areas,
  onChange,
}: {
  areas: Area[];
  onChange: (selection: CustomerSelection | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ExistingCustomer | null>(null);
  const [showNewFields, setShowNewFields] = useState(false);
  const [phone, setPhone] = useState("");
  const [areaId, setAreaId] = useState("");

  const { customers, isLoading } = useCustomers(query.length >= 2 ? query : undefined);

  function selectExisting(customer: ExistingCustomer) {
    setSelected(customer);
    setQuery(customer.name);
    setShowNewFields(false);
    onChange({ mode: "existing", customerId: customer.id, name: customer.name });
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    setShowNewFields(false);
    onChange(null);
  }

  function useAsNewCustomer() {
    setShowNewFields(true);
    emitNew(query, phone, areaId);
  }

  function emitNew(name: string, phone: string, areaId: string) {
    if (!name.trim()) {
      onChange(null);
      return;
    }
    onChange({
      mode: "new",
      name: name.trim(),
      phone: phone || undefined,
      areaId: areaId || undefined,
      accountTypeIds: [],
    });
  }

  const showResults = !selected && query.length >= 2;
  const noMatches = showResults && !isLoading && customers.length === 0;

  return (
    <div className="field">
      <label>Customer</label>
      <input
        type="text"
        placeholder="Type a name to search or add new…"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
      />

      {showResults && !showNewFields && (
        <div style={{ marginTop: 6 }}>
          {isLoading ? (
            <p style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>Searching…</p>
          ) : customers.length > 0 ? (
            // Clickable rows instead of a native <select size> listbox
            // — a listbox can pre-highlight its first enabled option
            // (since the placeholder option is disabled), so clicking
            // an already-highlighted row never fires onChange. Plain
            // buttons have no such ambiguity: a click always fires.
            <div className="panel" style={{ overflow: "hidden" }}>
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectExisting(c)}
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
              ))}
            </div>
          ) : null}

          {noMatches && (
            <button type="button" className="btn btn-primary" onClick={useAsNewCustomer} style={{ marginTop: 6 }}>
              <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add &quot;{query}&quot; as a new customer
            </button>
          )}
        </div>
      )}

      {showNewFields && (
        <div style={{ marginTop: 10 }}>
          <p
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--primary-600)",
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M4 12l6 6L20 6" />
            </svg>
            New customer — &quot;{query}&quot; will be created with this sale
          </p>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Phone (optional)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  emitNew(query, e.target.value, areaId);
                }}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Area (optional)</label>
              <select
                value={areaId}
                onChange={(e) => {
                  setAreaId(e.target.value);
                  emitNew(query, phone, e.target.value);
                }}
              >
                <option value="">No area</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
