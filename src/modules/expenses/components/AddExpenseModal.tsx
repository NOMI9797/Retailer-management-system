"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseForm } from "./ExpenseForm";

// Same pattern as AddAccountTypeModal/AddProductModal — owns its own
// open/close state locally, calls router.refresh() on save to re-run
// the server fetch behind the list's Suspense boundary.
export function AddExpenseModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add expense
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add expense</h2>
            <p className="modal-sub">
              Every expense needs a payment method — Cash Flow depends on it being set correctly.
            </p>
            <ExpenseForm
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
