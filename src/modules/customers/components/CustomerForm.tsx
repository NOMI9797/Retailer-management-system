"use client";

import { useState } from "react";
import { createCustomer } from "../actions";
import type { listAreas } from "@/modules/settings/areas.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];

// No account-type picker here — every customer automatically gets a
// Regular account (createCustomer's job), and an Udhaar account is
// only ever created later, on demand, the first time they actually
// take a loan or make a Credit sale. Settings' "Add account type"
// still exists for future types (e.g. registering a farmer's
// Consignment account uses its own flow) — this form just doesn't
// surface a picker for it anymore, per the "keep it simple" decision.
export function CustomerForm({
  areas,
  onSaved,
}: {
  areas: Area[];
  onSaved?: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [areaId, setAreaId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
        accountTypeIds: [],
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

      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save customer"}
        </button>
      </div>
    </form>
  );
}
