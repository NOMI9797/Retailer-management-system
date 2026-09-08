"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MonthlyExpenseForm } from "./MonthlyExpenseForm";
import type { listMonthlyExpenseTypes } from "../actions";

// Same pattern as AddExpenseModal — owns its own open/close state
// locally, calls router.refresh() on save to re-run the server fetch
// behind the Monthly expenses list's Suspense boundary.
export function AddMonthlyExpenseModal({
  types,
}: {
  types: Awaited<ReturnType<typeof listMonthlyExpenseTypes>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add monthly expense
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add monthly expense</h2>
            <p className="modal-sub">
              Pick from the monthly expense types managed in Settings.
            </p>
            <MonthlyExpenseForm
              types={types}
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
