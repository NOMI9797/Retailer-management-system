"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomer } from "../actions";
import { showToast } from "@/components/shared/toastStore";

// Delete on a Customers list row — same confirm-inline pattern as the
// app's other delete buttons. The server only allows it once nothing is
// owed either way (see deleteCustomer), and keeps their history.
export function DeleteCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteCustomer(customerId);
    setIsDeleting(false);
    setConfirming(false);
    if (!result.success) {
      showToast(result.error, "error");
      return;
    }
    showToast(`${name} deleted`);
    router.refresh();
  }

  if (confirming) {
    return (
      <>
        <span style={{ fontSize: 13, color: "var(--consigned-600)", marginRight: 6 }}>Delete {name}?</span>
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
    <button className="icon-btn" onClick={() => setConfirming(true)} title="Delete">
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
      </svg>
    </button>
  );
}
