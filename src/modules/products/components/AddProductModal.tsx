"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductForm } from "./ProductForm";
import type { listCategories, listUnits } from "../actions";

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// The one client leaf for adding a product — owns its own open/close
// state locally (not via the URL) since that's pure UI state with no
// reason to be shareable or bookmarkable. On save, router.refresh()
// re-runs the server fetch behind the table/grain panel's Suspense
// boundaries so the new row shows up without a full page reload.
export function AddProductModal({
  categories,
  units,
  defaultStockKind = "SIMPLE",
  lockStockKind = false,
  label = "Add product",
}: {
  categories: Category[];
  units: Unit[];
  defaultStockKind?: "SIMPLE" | "GRAIN";
  // See ProductForm's own comment — hides the Simple/Grain toggle and
  // pins the form to defaultStockKind, for a caller whose screen only
  // ever means one kind (Grain page → always Grain, Products page →
  // always Simple).
  lockStockKind?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add product</h2>
            {!lockStockKind && (
              <p className="modal-sub">Choose the stock type — this changes which fields you fill in.</p>
            )}
            <ProductForm
              categories={categories}
              units={units}
              defaultStockKind={defaultStockKind}
              lockStockKind={lockStockKind}
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
