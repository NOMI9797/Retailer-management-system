"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePurchaseReturn, deleteSaleReturn } from "../actions";
import { showToast } from "@/components/shared/toastStore";

// Delete (undo) a return after an inline confirm — the stock and money
// go back to how they were before it.
export function DeleteReturnButton({ kind, id }: { kind: "SALE" | "PURCHASE"; id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = kind === "SALE" ? await deleteSaleReturn(id) : await deletePurchaseReturn(id);
    setIsDeleting(false);
    if (!result.success) {
      setError(result.error);
      setConfirming(false);
      return;
    }
    showToast("Return deleted");
    router.refresh();
  }

  if (confirming) {
    return (
      <>
        <span style={{ fontSize: 13, color: "var(--consigned-600)", marginRight: 8 }}>Undo this return?</span>
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
      <button className="icon-btn" onClick={() => setConfirming(true)} title="Delete return">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
        </svg>
      </button>
    </>
  );
}
