"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteExpense } from "../actions";

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteExpense(expenseId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
      setConfirming(false);
    } finally {
      setIsDeleting(false);
    }
  }

  if (confirming) {
    return (
      <>
        <span style={{ fontSize: 13, color: "var(--consigned-600)", marginRight: 8 }}>Delete this expense?</span>
        <button className="btn btn-primary" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={isDeleting}>
          Cancel
        </button>
      </>
    );
  }

  return (
    <>
      {error && <span style={{ fontSize: 12.5, color: "var(--consigned-600)", marginRight: 8 }}>{error}</span>}
      <button className="icon-btn" onClick={() => setConfirming(true)}>
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
        </svg>
      </button>
    </>
  );
}
