"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProduct, deleteProduct } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import type { listCategories } from "../actions";

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Product = {
  id: string;
  name: string;
  categoryId: string;
  unitId: string;
  isActive: boolean;
};

// A grain product's own management controls — Edit (name/category/
// unit only; grain products have no cost/sell price, see
// EditProductModal's comment on why that form is Simple-stock-only),
// Deactivate/Activate, and Delete. Delete requires the product be
// deactivated FIRST (same two-step rule every other Settings/catalog
// entity follows — deleteProduct itself enforces this server-side
// too) and soft-deletes rather than a real DELETE, since
// DailySaleItem/DealerProductPurchase/GrainBatch/StockUdhaarEntry all
// hold a required foreign key to Product — see deleteProduct's
// comment. router.refresh() after any action re-runs the Grain page's
// own listProducts fetch, so the tab strip and this panel both update
// immediately.
export function GrainProductActions({
  product,
  categories,
}: {
  product: Product;
  categories: Category[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(product.name);
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await updateProduct({ id: product.id, name, categoryId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast("Product updated");
      setEditing(false);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

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

  if (editing) {
    return (
      <form onSubmit={handleSave} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {error && <p className="form-banner error" style={{ width: "100%", margin: 0 }}>{error}</p>}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={{ width: 200 }}
          required
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={isSaving}>
          Cancel
        </button>
      </form>
    );
  }

  if (confirmingDelete) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--consigned-600)" }}>Delete this product?</span>
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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button className="btn btn-ghost" onClick={() => setEditing(true)} disabled={isSaving}>
        Edit
      </button>
      <button className="btn btn-ghost" onClick={handleToggleActive} disabled={isSaving}>
        {product.isActive ? "Deactivate" : "Activate"}
      </button>
      {!product.isActive && (
        <button className="btn btn-ghost" onClick={() => setConfirmingDelete(true)} disabled={isSaving}>
          Delete
        </button>
      )}
    </div>
  );
}
