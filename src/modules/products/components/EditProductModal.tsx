"use client";

import { useEffect, useState } from "react";
import { updateProduct } from "../actions";
import type { listCategories, listUnits, listProducts } from "../actions";

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

// Every field is editable after creation — no locked fields, per the
// system's full-access principle. Categories/units arrive as props
// rather than being fetched here.
export function EditProductModal({
  product,
  categories,
  units,
  onClose,
  onSaved,
}: {
  product: Product;
  categories: Category[];
  units: Unit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [unitId, setUnitId] = useState(product.unitId);
  const [name, setName] = useState(product.name);
  const [costPrice, setCostPrice] = useState(String(product.costPrice ?? ""));
  const [sellPrice, setSellPrice] = useState(String(product.sellPrice ?? ""));
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await updateProduct({
        id: product.id,
        categoryId,
        unitId,
        name,
        costPrice: Number(costPrice),
        sellPrice: Number(sellPrice),
        quantity: Number(quantity),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit product</h2>
        <p className="modal-sub">Update any field — changes apply immediately.</p>

        <form onSubmit={handleSubmit}>
          {error && <p className="form-banner error">{error}</p>}

          <div className="field">
            <label>Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Product name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Unit</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Quantity</label>
              <input
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Cost price</label>
              <input
                type="number"
                min="0"
                step="any"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Sell price</label>
              <input
                type="number"
                min="0"
                step="any"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
