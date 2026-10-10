"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditProductModal } from "./EditProductModal";
import { updateProduct, deleteProduct } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import type { listProducts, listCategories, listUnits } from "../actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];
type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// The row's client leaf — owns Edit modal open/close state plus
// Deactivate/Activate and Delete, same cluster GrainProductActions
// provides for grain products. Rendered directly by SimpleStockTable
// (a Server Component), which already has the full product/
// categories/units in scope, so they pass straight through as props
// with no extra fetch. Delete requires the product be deactivated
// FIRST (deleteProduct enforces this server-side too) and soft-
// deletes rather than a real DELETE — see that function's comment.
export function EditProductButton({
  product,
  categories,
  units,
}: {
  product: Product;
  categories: Category[];
  units: Unit[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleToggleActive() {
    setIsSaving(true);
    try {
      const result = await updateProduct({ id: product.id, isActive: !product.isActive });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      showToast(product.isActive ? "Product deactivated" : "Product activated");
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsSaving(true);
    try {
      const result = await deleteProduct(product.id);
      if (!result.success) {
        showToast(result.error, "error");
        setConfirmingDelete(false);
        return;
      }
      showToast("Product deleted");
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  if (confirmingDelete) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--consigned-600)" }}>Delete?</span>
        <button className="btn btn-primary" onClick={handleDelete} disabled={isSaving}>
          {isSaving ? "Deleting…" : "Yes, delete"}
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} disabled={isSaving}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} title="Edit">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      <button className="btn btn-ghost" onClick={handleToggleActive} disabled={isSaving}>
        {product.isActive ? "Deactivate" : "Activate"}
      </button>
      {!product.isActive && (
        <button className="btn btn-ghost" onClick={() => setConfirmingDelete(true)} disabled={isSaving}>
          Delete
        </button>
      )}

      {open && (
        <EditProductModal
          product={product}
          categories={categories}
          units={units}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
