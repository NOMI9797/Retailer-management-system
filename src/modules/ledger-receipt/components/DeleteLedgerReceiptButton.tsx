"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSavedLedgerReceipt } from "../actions";
import { showToast } from "@/components/shared/toastStore";

// Delete a saved ledger receipt, after an inline confirm. Only the
// receipt goes — no entry or balance is touched. redirectTo: where to
// go afterwards (the receipt's own page can't stay open).
export function DeleteLedgerReceiptButton({
  id,
  redirectTo,
}: {
  id: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const response = await deleteSavedLedgerReceipt(id);
    setIsDeleting(false);
    if (!response.success) {
      setError(response.error);
      setConfirming(false);
      return;
    }
    showToast("Ledger receipt deleted");
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  if (confirming) {
    return (
      <>
        <span
          style={{
            fontSize: 13,
            color: "var(--consigned-600)",
            margin: "0 8px",
          }}
        >
          Delete this receipt?
        </span>
        <button
          className="btn btn-primary"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => setConfirming(false)}
          disabled={isDeleting}
        >
          Cancel
        </button>
      </>
    );
  }

  return (
    <>
      {error && (
        <span
          style={{
            fontSize: 12.5,
            color: "var(--consigned-600)",
            marginRight: 8,
          }}
        >
          {error}
        </span>
      )}
      <button
        className="icon-btn"
        onClick={() => setConfirming(true)}
        title="Delete receipt"
      >
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
        </svg>
      </button>
    </>
  );
}
