"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccountTypeForm } from "./AccountTypeForm";

// Same pattern as AddProductModal — owns its own open/close state
// locally, calls router.refresh() on save to re-run the server fetch
// behind the list's Suspense boundary.
export function AddAccountTypeModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add account type
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add account type</h2>
            <p className="modal-sub">
              Define the account type and any custom fields it needs (e.g. guarantor name for a loan).
            </p>
            <AccountTypeForm
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
