"use client";

import type { listProducts } from "@/modules/products/actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

export type LineItemDraft = {
  productId: string;
  quantity: string;
  actualPrice: string;
};

export function LineItemsEditor({
  products,
  items,
  onChange,
}: {
  products: Product[];
  items: LineItemDraft[];
  onChange: (items: LineItemDraft[]) => void;
}) {
  function addItem() {
    onChange([...items, { productId: "", quantity: "", actualPrice: "" }]);
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
      }
      return updated;
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
        return (
          <div key={i} className="field-row" style={{ marginBottom: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <select value={item.productId} onChange={(e) => updateItem(i, { productId: e.target.value })} required>
                <option value="" disabled>
                  Select product
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit.name})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: "0 1 180px" }}>
              <input
                type="number"
                min="0"
                step="any"
                placeholder={`Qty${product ? ` (${product.unit.name})` : ""}`}
                value={item.quantity}
                onChange={(e) => updateItem(i, { quantity: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: "0 1 180px" }}>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Price"
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
