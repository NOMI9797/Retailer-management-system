"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerForm } from "./CustomerForm";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";

export function AddCustomerModal({
  areas,
  accountTypes,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  accountTypes: Awaited<ReturnType<typeof listAccountTypes>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add customer
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add customer</h2>
            <p className="modal-sub">Name is the only required field — everything else can be filled in later.</p>
            <CustomerForm
              areas={areas}
              accountTypes={accountTypes}
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
