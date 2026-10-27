"use client";

import { useEffect, useState } from "react";
import { updateProduct } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { TwoUnitSetup, SubUnitPriceHint } from "./TwoUnitSetup";
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
  // This form is SIMPLE-stock-only (see the cost/sell price fields
  // below — grain products have no such editor) — so the dropdown
  // only ever offers SIMPLE categories, same "matching-kind only"
  // rule ProductForm's own dropdown now follows.
  const simpleCategories = categories.filter((c) => c.stockKind === "SIMPLE");
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [unitId, setUnitId] = useState(product.unitId);
  const [name, setName] = useState(product.name);
  const [costPrice, setCostPrice] = useState(String(product.costPrice ?? ""));
  const [sellPrice, setSellPrice] = useState(String(product.sellPrice ?? ""));
  // An untracked product opens with an empty Quantity; typing one in
  // starts tracking its stock (see updateProduct).
  const initialQuantity = product.tracksStock ? String(Number(Number(product.quantity).toFixed(3))) : "";
  const [quantity, setQuantity] = useState(initialQuantity);
  // Sold in two units — turning it on (or off) never changes stock or
  // prices already recorded; they stay per main unit.
  const [twoUnits, setTwoUnits] = useState({
    enabled: !!product.subUnitId,
    subUnitId: product.subUnitId ?? "",
    perUnit: product.subUnitsPerUnit != null ? String(Number(product.subUnitsPerUnit)) : "",
  });
  const [quantityUnit, setQuantityUnit] = useState<"MAIN" | "SUB">("MAIN");
  const mainName = units.find((u) => u.id === unitId)?.name ?? "unit";
  const subName = units.find((u) => u.id === twoUnits.subUnitId)?.name ?? "small unit";
  const priceLabel = twoUnits.enabled ? ` (per ${mainName})` : "";
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
      const result = await updateProduct({
        id: product.id,
        categoryId,
        unitId,
        name,
        costPrice: Number(costPrice),
        sellPrice: Number(sellPrice),
        // Only sent when changed — so saving other fields never rounds
        // the stock (kept to the gram for two-unit products).
        quantity:
          quantity.trim() && !(quantity === initialQuantity && quantityUnit === "MAIN") ? Number(quantity) : undefined,
        quantityUnit: twoUnits.enabled ? quantityUnit : undefined,
        subUnitId: twoUnits.enabled ? twoUnits.subUnitId : null,
        subUnitsPerUnit: twoUnits.enabled ? Number(twoUnits.perUnit) : null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast("Product updated");
      onSaved();
    } catch {
      setError("Failed to update product");
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
              {simpleCategories.map((c) => (
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
              <label>Quantity{product.tracksStock ? "" : " (optional)"}</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={quantity}
                  placeholder={product.tracksStock ? undefined : "Not tracked — leave blank"}
                  onChange={(e) => setQuantity(e.target.value)}
                  required={product.tracksStock}
                />
                {twoUnits.enabled && twoUnits.subUnitId && (
                  <select
                    value={quantityUnit}
                    onChange={(e) => {
                      // Show the same stock in the other unit.
                      const next = e.target.value as "MAIN" | "SUB";
                      const n = Number(twoUnits.perUnit);
                      if (quantity.trim() && n > 0 && next !== quantityUnit) {
                        const q = Number(quantity);
                        setQuantity(String(Number((next === "SUB" ? q * n : q / n).toFixed(3))));
                      }
                      setQuantityUnit(next);
                    }}
                    style={{ width: "auto" }}
                  >
                    <option value="MAIN">{mainName}</option>
                    <option value="SUB">{subName}</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          <TwoUnitSetup
            units={units}
            mainUnitId={unitId}
            enabled={twoUnits.enabled}
            subUnitId={twoUnits.subUnitId}
            perUnit={twoUnits.perUnit}
            onChange={setTwoUnits}
          />

          <div className="field-row">
            <div className="field">
              <label>Cost price{priceLabel}</label>
              <input
                type="number"
                min="0"
                step="any"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                required
              />
              {twoUnits.enabled && <SubUnitPriceHint price={costPrice} perUnit={twoUnits.perUnit} subName={subName} />}
            </div>
            <div className="field">
              <label>Sell price{priceLabel}</label>
              <input
                type="number"
                min="0"
                step="any"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                required
              />
              {twoUnits.enabled && <SubUnitPriceHint price={sellPrice} perUnit={twoUnits.perUnit} subName={subName} />}
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
