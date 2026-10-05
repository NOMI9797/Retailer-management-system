"use client";

import { useState } from "react";
import { createProduct, createGrainProduct } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import type { listCategories, listUnits } from "../actions";

type StockKind = "SIMPLE" | "GRAIN";
type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// Shared shape for adding a product — category-conditional: simple
// stock asks for cost/sell price + starting quantity; grain stock
// asks for name/unit only — no product-level rate, since a product is
// never priced itself, only its individual batches are (added
// separately afterward, each with its own real rate). Categories/units
// arrive as props (fetched server-side, cached) rather than being
// fetched here.
export function ProductForm({
  categories,
  units,
  onSaved,
  defaultStockKind = "SIMPLE",
  lockStockKind = false,
}: {
  categories: Category[];
  units: Unit[];
  onSaved?: () => void;
  // Lets the Grain page's "Add product" modal open pre-selected to
  // Grain (the shopkeeper is already on a grain-only screen), while
  // Products' own modal keeps defaulting to Simple — same form, no
  // duplicated markup.
  defaultStockKind?: StockKind;
  // Hides the Simple/Grain toggle entirely and pins the form to
  // defaultStockKind — each caller already knows its own context (the
  // Grain page only ever wants a grain product, Products only ever
  // wants a simple one), so showing a switch that could produce the
  // WRONG kind for that screen is pure confusion, not flexibility.
  lockStockKind?: boolean;
}) {
  const [stockKind, setStockKind] = useState<StockKind>(defaultStockKind);
  const [categoryId, setCategoryId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [name, setName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Category.stockKind means the dropdown only ever offers categories
  // matching the active toggle (never a grain product filed under a
  // merchandise category or vice versa) — switching the toggle clears
  // any pick that's no longer valid, same "changing a filter clears a
  // now-invalid selection" precedent CategorySelect/LineItemsEditor
  // already follow elsewhere.
  const filteredCategories = categories.filter((c) => c.stockKind === stockKind);

  function switchStockKind(next: StockKind) {
    setStockKind(next);
    setCategoryId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result =
        stockKind === "SIMPLE"
          ? await createProduct({
              categoryId,
              unitId,
              name,
              costPrice: Number(costPrice),
              sellPrice: Number(sellPrice),
              quantity: quantity ? Number(quantity) : 0,
            })
          : await createGrainProduct({
              categoryId,
              unitId,
              name,
            });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast(`Product added — ${name}`);
      onSaved?.();
    } catch {
      setError("Failed to save product");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {!lockStockKind && (
        <div className="stock-toggle">
          <button
            type="button"
            className={stockKind === "SIMPLE" ? "active" : ""}
            onClick={() => switchStockKind("SIMPLE")}
          >
            Simple stock
          </button>
          <button
            type="button"
            className={stockKind === "GRAIN" ? "active" : ""}
            onClick={() => switchStockKind("GRAIN")}
          >
            Grain stock
          </button>
        </div>
      )}

      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Category</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="" disabled>
            Select category
          </option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Product name</label>
        <input
          type="text"
          placeholder={stockKind === "SIMPLE" ? "e.g. Cooking oil" : "e.g. Wheat"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {stockKind === "SIMPLE" ? (
        <>
          <div className="field-row">
            <div className="field">
              <label>Unit</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                <option value="" disabled>
                  Select unit
                </option>
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
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
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
                placeholder="Rs 0"
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
                placeholder="Rs 0"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                required
              />
            </div>
          </div>
        </>
      ) : (
        <div className="field">
          <label>Unit</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
            <option value="" disabled>
              Select unit
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save product"}
        </button>
      </div>
    </form>
  );
}
