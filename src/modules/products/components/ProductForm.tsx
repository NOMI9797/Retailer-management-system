"use client";

import { useState } from "react";
import { createProduct, createGrainProduct } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { TwoUnitSetup, SubUnitPriceHint } from "./TwoUnitSetup";
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
  // Sold in two units (Bag and Kgs): the small unit, how many make one
  // main unit, and which unit the opening quantity is typed in.
  const [twoUnits, setTwoUnits] = useState({ enabled: false, subUnitId: "", perUnit: "" });
  const [quantityUnit, setQuantityUnit] = useState<"MAIN" | "SUB">("MAIN");
  const mainName = units.find((u) => u.id === unitId)?.name ?? "unit";
  const subName = units.find((u) => u.id === twoUnits.subUnitId)?.name ?? "small unit";
  const priceLabel = twoUnits.enabled ? ` (per ${mainName})` : "";
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
              // Left blank → stock isn't tracked (see Product.tracksStock).
              quantity: quantity.trim() ? Number(quantity) : undefined,
              quantityUnit: twoUnits.enabled ? quantityUnit : undefined,
              subUnitId: twoUnits.enabled ? twoUnits.subUnitId : null,
              subUnitsPerUnit: twoUnits.enabled ? Number(twoUnits.perUnit) : null,
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
              <label>Quantity (optional)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Leave blank to not track stock"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                {twoUnits.enabled && twoUnits.subUnitId && (
                  <select
                    value={quantityUnit}
                    onChange={(e) => setQuantityUnit(e.target.value as "MAIN" | "SUB")}
                    style={{ width: "auto" }}
                  >
                    <option value="MAIN">{mainName}</option>
                    <option value="SUB">{subName}</option>
                  </select>
                )}
              </div>
            </div>
          </div>
          {unitId && (
            <TwoUnitSetup
              units={units}
              mainUnitId={unitId}
              enabled={twoUnits.enabled}
              subUnitId={twoUnits.subUnitId}
              perUnit={twoUnits.perUnit}
              onChange={setTwoUnits}
            />
          )}
          <div className="field-row">
            <div className="field">
              <label>Cost price{priceLabel}</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Rs 0"
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
                placeholder="Rs 0"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                required
              />
              {twoUnits.enabled && <SubUnitPriceHint price={sellPrice} perUnit={twoUnits.perUnit} subName={subName} />}
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
