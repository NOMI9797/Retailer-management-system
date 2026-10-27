"use client";

import { useMemo } from "react";
import type { listProducts } from "@/modules/products/actions";
import { subUnitsPerUnit } from "@/modules/products/units";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

export type LineItemDraft = {
  productId: string;
  quantity: string;
  actualPrice: string;
  categoryId?: string;
  // A two-unit product (Bag / Kgs): which unit quantity and price are in.
  unit?: "MAIN" | "SUB";
};

// Filtering by category first is purely a narrowing aid for the
// product dropdown — categoryId never gets sent to createDailySale,
// it just cuts down which options the shopkeeper has to scroll
// through in a shop with hundreds of products.
export function LineItemsEditor({
  products,
  items,
  onChange,
}: {
  products: Product[];
  items: LineItemDraft[];
  onChange: (items: LineItemDraft[]) => void;
}) {
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of products) seen.set(p.categoryId, p.category.name);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  function addItem() {
    onChange([...items, { productId: "", quantity: "", actualPrice: "", categoryId: "" }]);
  }

  function updateItem(index: number, patch: Partial<LineItemDraft>) {
    const next = items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, ...patch };
      // Auto-fill the catalog's default sell price when a product is
      // picked, but the shopkeeper can still override it per the
      // milestone's "actual price may differ from catalog default".
      if (patch.productId) {
        const product = products.find((p) => p.id === patch.productId);
        const defaultPrice = product?.sellPrice ?? product?.baseRate;
        if (defaultPrice != null) updated.actualPrice = String(defaultPrice);
        updated.unit = "MAIN";
      }
      // Switching Bag ↔ Kgs moves the price to the new unit (e.g. Rs
      // 2,500 a bag → Rs 50 a kg), so the line keeps the same rate.
      if (patch.unit && patch.unit !== (item.unit ?? "MAIN")) {
        const product = products.find((p) => p.id === item.productId);
        const n = product ? subUnitsPerUnit(product) : null;
        const price = Number(item.actualPrice);
        if (n && price > 0) {
          const next = patch.unit === "SUB" ? price / n : price * n;
          updated.actualPrice = String(Math.round(next * 100) / 100);
        }
      }
      return updated;
    });
    onChange(next);
  }

  function updateCategory(index: number, categoryId: string) {
    // Changing the category clears any product pick that no longer
    // belongs to it — keeps the row from silently sending a product
    // that's not even in the newly selected category.
    const next = items.map((item, i) => {
      if (i !== index) return item;
      const stillValid = products.find((p) => p.id === item.productId)?.categoryId === categoryId;
      return { ...item, categoryId, productId: stillValid ? item.productId : "" };
    });
    onChange(next);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="field">
      <label>Items</label>
      {items.map((item, i) => {
        const product = products.find((p) => p.id === item.productId);
        const twoUnit = product && subUnitsPerUnit(product) ? product : null;
        const unitLabel = product ? (item.unit === "SUB" && twoUnit ? twoUnit.subUnit!.name : product.unit.name) : "";
        const filteredProducts = item.categoryId
          ? products.filter((p) => p.categoryId === item.categoryId)
          : products;
        return (
          <div key={i} className="field-row" style={{ marginBottom: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0, flex: "0 1 200px" }}>
              <select value={item.categoryId || ""} onChange={(e) => updateCategory(i, e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <select value={item.productId} onChange={(e) => updateItem(i, { productId: e.target.value })} required>
                <option value="" disabled>
                  Select product
                </option>
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit.name}
                    {subUnitsPerUnit(p) ? ` / ${p.subUnit!.name}` : ""})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: "0 1 180px" }}>
              <input
                type="number"
                min="0"
                step="any"
                placeholder={`Qty${product ? ` (${unitLabel})` : ""}`}
                value={item.quantity}
                onChange={(e) => updateItem(i, { quantity: e.target.value })}
                required
              />
            </div>
            {twoUnit && (
              <div className="field" style={{ marginBottom: 0, flex: "0 1 120px" }}>
                <select
                  value={item.unit ?? "MAIN"}
                  onChange={(e) => updateItem(i, { unit: e.target.value as "MAIN" | "SUB" })}
                  aria-label="Unit"
                >
                  <option value="MAIN">{twoUnit.unit.name}</option>
                  <option value="SUB">{twoUnit.subUnit!.name}</option>
                </select>
              </div>
            )}
            <div className="field" style={{ marginBottom: 0, flex: "0 1 180px" }}>
              <input
                type="number"
                min="0"
                step="any"
                placeholder={product ? `Price per ${unitLabel}` : "Price"}
                value={item.actualPrice}
                onChange={(e) => updateItem(i, { actualPrice: e.target.value })}
                required
              />
            </div>
            <button type="button" className="icon-btn" onClick={() => removeItem(i)}>
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost" onClick={addItem}>
        + Add item
      </button>
    </div>
  );
}
