"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MonthlyExpenseForm } from "./MonthlyExpenseForm";
import type { listMonthlyExpenses, listMonthlyExpenseTypes } from "../actions";

type MonthlyExpense = Awaited<ReturnType<typeof listMonthlyExpenses>>["expenses"][number];

// The one client leaf per row — same pattern as EditExpenseButton.
export function EditMonthlyExpenseButton({
  expense,
  types,
}: {
  expense: MonthlyExpense;
  types: Awaited<ReturnType<typeof listMonthlyExpenseTypes>>;
}) {
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
            <h2>Edit monthly expense</h2>
            <MonthlyExpenseForm
              types={types}
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
