"use client";

import { useState } from "react";
import { createProduct, createGrainProduct } from "../actions";
import type { listCategories, listUnits } from "../actions";

type StockKind = "SIMPLE" | "GRAIN";
type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// Shared shape for adding a product — category-conditional: simple
// stock asks for cost/sell price + starting quantity, grain stock
// asks for a base rate only (batches are added separately afterward).
// Categories/units arrive as props (fetched server-side, cached)
// rather than being fetched here.
export function ProductForm({
  categories,
  units,
  onSaved,
}: {
  categories: Category[];
  units: Unit[];
  onSaved?: () => void;
}) {
  const [stockKind, setStockKind] = useState<StockKind>("SIMPLE");
  const [categoryId, setCategoryId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [name, setName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [baseRate, setBaseRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      if (stockKind === "SIMPLE") {
        await createProduct({
          categoryId,
          unitId,
          name,
          costPrice: Number(costPrice),
          sellPrice: Number(sellPrice),
          quantity: quantity ? Number(quantity) : 0,
        });
      } else {
        await createGrainProduct({
          categoryId,
          unitId,
          name,
          baseRate: Number(baseRate),
        });
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="stock-toggle">
        <button
          type="button"
          className={stockKind === "SIMPLE" ? "active" : ""}
          onClick={() => setStockKind("SIMPLE")}
        >
          Simple stock
        </button>
        <button
          type="button"
          className={stockKind === "GRAIN" ? "active" : ""}
          onClick={() => setStockKind("GRAIN")}
        >
          Grain stock
        </button>
      </div>

      {error && <p className="form-banner error">{error}</p>}

      <div className="field">
        <label>Category</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="" disabled>
            Select category
          </option>
          {categories.map((c) => (
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
            <label>Base rate</label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Rs 0 / unit"
              value={baseRate}
              onChange={(e) => setBaseRate(e.target.value)}
              required
            />
          </div>
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
