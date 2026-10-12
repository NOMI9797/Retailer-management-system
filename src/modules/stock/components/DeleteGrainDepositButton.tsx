"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteGrainBatch } from "@/modules/products/batches.actions";
import { showToast } from "@/components/shared/toastStore";

// Same confirm-inline pattern as the other delete buttons, pointed at
// deleteGrainBatch — safe here specifically because a still-unsettled
// deposit posted nothing on creation (see that action's comment), so
// there's nothing to reverse, just a plain row removal.
export function DeleteGrainDepositButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteGrainBatch(batchId);
    if (!result.success) {
      setError(result.error);
      setConfirming(false);
      setIsDeleting(false);
      return;
    }
    showToast("Deposit deleted");
    setIsDeleting(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <>
        <span style={{ fontSize: 13, color: "var(--consigned-600)", marginRight: 8 }}>Delete this deposit?</span>
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
      <button className="icon-btn" onClick={() => setConfirming(true)} title="Delete">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
        </svg>
      </button>
    </>
  );
}
