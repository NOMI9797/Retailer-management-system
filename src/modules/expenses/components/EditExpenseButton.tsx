"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseForm } from "./ExpenseForm";
import type { listExpenses } from "../actions";

type Expense = Awaited<ReturnType<typeof listExpenses>>["expenses"][number];

// The one client leaf per row — owns its own open/close state
// locally, same pattern as EditProductButton.
export function EditExpenseButton({ expense }: { expense: Expense }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit expense</h2>
            <ExpenseForm
              expense={expense}
              onCancel={() => setOpen(false)}
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
