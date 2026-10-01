"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TransferPurchaseForm } from "./TransferPurchaseForm";

// "Buy from customer" trigger + modal — same shape as AddBatchModal/
// AddProductModal/AddExpenseModal, so every "Add X"/action button in
// the app opens the same way instead of this one expanding inline
// below its table row. Owns its own open/close state locally, same
// reasoning as those other modals: pure UI state, no reason to be
// shareable.
export function BuyFromCustomerModal({
  grainBatchId,
  customerName,
  remainingClaim,
  unitName,
  onDone,
}: {
  grainBatchId: string;
  customerName: string;
  remainingClaim: number;
  unitName: string;
  // Optional extra callback alongside router.refresh() — a caller
  // holding its own already-fetched client state (e.g.
  // StockFromCustomerForm's deposits list) needs to explicitly
  // refetch, since router.refresh() only re-runs Server Components.
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setOpen(true)}>
        Buy from customer
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Buy from {customerName}</h2>
            <TransferPurchaseForm
              grainBatchId={grainBatchId}
              remainingClaim={remainingClaim}
              unitName={unitName}
              onSaved={() => {
                setOpen(false);
                router.refresh();
                onDone?.();
              }}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
