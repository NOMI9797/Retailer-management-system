"use client";

import { useState } from "react";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";

export type PickedCustomer = { id: string; name: string };

// Search-as-you-type picker for an EXISTING customer only (no "create
// new" path — see CustomerPicker for that). Shows the picked customer
// with a Change button once one is chosen.
export function ExistingCustomerSearch({
  value,
  onChange,
}: {
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const { customers, isLoading } = useCustomers(query.length >= 2 ? query : undefined);

  if (value) {
    return (
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
        <span>{value.name}</span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onChange(null)}
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
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
                  onChange({ id: c.id, name: c.name });
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
  );
}
