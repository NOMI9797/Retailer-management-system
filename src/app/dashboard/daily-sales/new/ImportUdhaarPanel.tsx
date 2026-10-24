"use client";

import { useState } from "react";
import { ExistingCustomerSearch, type PickedCustomer } from "@/modules/customers/components/ExistingCustomerSearch";
import { ImportUdhaarForm } from "@/modules/customers/components/ImportUdhaarModal";

// Pick an existing customer, then the same ImportUdhaarForm the
// customer page's "Import data" button uses.
export function ImportUdhaarPanel({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);

  return (
    <>
      <div className="field">
        <label>Customer</label>
        <ExistingCustomerSearch value={customer} onChange={setCustomer} />
      </div>

      {customer && <ImportUdhaarForm key={customer.id} customerId={customer.id} onSaved={onSaved} onCancel={onCancel} />}
    </>
  );
}
