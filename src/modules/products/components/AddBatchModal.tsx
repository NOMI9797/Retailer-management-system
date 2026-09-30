"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GrainBatchForm } from "./GrainBatchForm";
import type { listAreas } from "@/modules/settings/areas.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];

// The "Add batch" trigger + modal — same shape as AddProductModal/
// AddExpenseModal, so every "Add X" action in the app opens the same
// way instead of this one being an inline expand-below-the-table
// affordance. Owns its own open/close state locally, same reasoning
// as those other modals: pure UI state, no reason to be shareable.
export function AddBatchModal({ productId, areas }: { productId: string; areas: Area[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add batch
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add batch</h2>
            <p className="modal-sub">
              Record a new deposit — shop-owned stock, or a customer dropping off grain for safekeeping.
            </p>
            <GrainBatchForm
              productId={productId}
              areas={areas}
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
