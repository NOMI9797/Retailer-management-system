"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerForm } from "./CustomerForm";
import type { listAreas } from "@/modules/settings/areas.actions";

// Edit entry point — used on both the customer detail page's header
// and the Customers list table's row actions (same trigger+modal
// shape as AddCustomerModal either way), just pre-filled via
// CustomerForm's edit mode (passing `customer`). router.refresh()
// after save re-runs whichever query the caller's page uses, so the
// edit reflects immediately — there is no separate copy of a
// customer's name cached anywhere else in the app (every purchase/
// account/grain row reads it live via the Customer relation, not a
// denormalized snapshot), so nothing further needs to be touched for
// the edit to "reflect in attached records."
export function EditCustomerModal({
  areas,
  customer,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  customer: { id: string; name: string; phone: string | null; areaId: string | null; notes: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
        Edit
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit customer</h2>
            <CustomerForm
              areas={areas}
              customer={customer}
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
