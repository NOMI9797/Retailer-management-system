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
export function AddProductModal({ categories, units }: { categories: Category[]; units: Unit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add product
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add product</h2>
            <p className="modal-sub">Choose the stock type — this changes which fields you fill in.</p>
            <ProductForm
              categories={categories}
              units={units}
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
