"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDailySale } from "../actions";

export function DeleteSaleButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteDailySale(saleId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sale");
      setConfirming(false);
    } finally {
      setIsDeleting(false);
    }
  }

  if (confirming) {
    return (
      <>
        <span style={{ fontSize: 13, color: "var(--consigned-600)", marginRight: 8 }}>
          Delete this sale? Stock and balances will be reversed.
        </span>
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
      <button className="btn btn-ghost" onClick={() => setConfirming(true)}>
        Delete
      </button>
    </>
  );
}
