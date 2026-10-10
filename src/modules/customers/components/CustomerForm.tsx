"use client";

import { useState } from "react";
import { createCustomer, updateCustomer } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import type { listAreas } from "@/modules/settings/areas.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
// Structural, not tied to getCustomer's specific return type — both
// getCustomer (detail page) and listCustomers (list page) satisfy
// this, since this form only ever reads these four fields regardless
// of which richer shape the caller actually fetched.
type Customer = {
  id: string;
  name: string;
  phone: string | null;
  areaId: string | null;
  notes: string | null;
};

// No account-type picker here — every customer automatically gets a
// Regular account (createCustomer's job), and an Udhaar account is
// only ever created later, on demand, the first time they actually
// take a loan or make a Credit sale. Settings' "Add account type"
// still exists for any other future account type — this form just
// doesn't surface a picker for it anymore, per the "keep it simple"
// decision.
//
// One form for both add and edit, same shape ExpenseForm already
// uses — only whether an existing customer is passed in and which
// Server Action gets called differs. Editing never touches
// accountTypeIds (updateCustomer doesn't accept it) — which account
// types a customer holds is managed separately via
// addCustomerAccount/changeCustomerAccountType/removeCustomerAccount,
// not through this name/phone/area/notes form.
export function CustomerForm({
  areas,
  customer,
  onSaved,
}: {
  areas: Area[];
  customer?: Customer;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [areaId, setAreaId] = useState(customer?.areaId ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      if (customer) {
        const result = await updateCustomer({
          id: customer.id,
          name,
          phone: phone || undefined,
          areaId: areaId || null,
          notes: notes || undefined,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        showToast("Customer updated");
      } else {
        await createCustomer({
          name,
          phone: phone || undefined,
          areaId: areaId || undefined,
          notes: notes || undefined,
          accountTypeIds: [],
        });
        showToast(`Customer added — ${name}`);
      }
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
          {isSaving ? "Saving…" : customer ? "Save changes" : "Save customer"}
        </button>
      </div>
    </form>
  );
}
