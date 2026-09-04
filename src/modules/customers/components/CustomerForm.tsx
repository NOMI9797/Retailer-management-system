"use client";

import { useState } from "react";
import { createCustomer } from "../actions";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
type AccountType = Awaited<ReturnType<typeof listAccountTypes>>[number];

// Account types are multi-select checkboxes (a customer can hold
// several accounts at once, e.g. Regular + a Loan) — pulling only
// from the shopkeeper-managed Settings list, never typed freehand.
export function CustomerForm({
  areas,
  accountTypes,
  onSaved,
}: {
  areas: Area[];
  accountTypes: AccountType[];
  onSaved?: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [areaId, setAreaId] = useState("");
  const [notes, setNotes] = useState("");
  const [accountTypeIds, setAccountTypeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function toggleAccountType(id: string) {
    setAccountTypeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await createCustomer({
        name,
        phone: phone || undefined,
        areaId: areaId || undefined,
        notes: notes || undefined,
        accountTypeIds,
      });
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save customer");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Phone</label>
          <input type="text" placeholder="0300-0000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>Area</label>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">No area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Notes</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="field">
        <label>Account types</label>
        {accountTypes.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>
            No account types yet — add one under Settings first.
          </p>
        ) : (
          accountTypes.map((type) => (
            <label key={type.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={accountTypeIds.includes(type.id)}
                onChange={() => toggleAccountType(type.id)}
                style={{ width: "auto" }}
              />
              {type.name}
            </label>
          ))
        )}
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save customer"}
        </button>
      </div>
    </form>
  );
}
