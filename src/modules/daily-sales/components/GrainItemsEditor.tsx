"use client";

import { useMemo, useState } from "react";
import type { listProducts } from "@/modules/products/actions";
import { toLocalDateString } from "@/lib/utils";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];
type DurationUnit = "DAYS" | "WEEKS" | "MONTHS";

export type GrainItemDraft = {
  productId: string;
  quantity: string;
  actualPrice: string;
  categoryId?: string;
  // How much of THIS item's own price is Credit — only ever shown/
  // used when the sale has more than one grain item and the sale-
  // level Credit amount is nonzero; stays undefined otherwise, since
  // a single grain item's whole Credit amount is unambiguous and
  // needs no per-item split (see dailySaleItemSchema's comment).
  creditAmount?: string;
  // "YYYY-MM-DD" — when THIS item's Udhaar must be paid back by.
  // Always derived from a duration (see GrainDueDatePicker below),
  // never typed directly, same "no free date picker" precedent
  // Long-term Udhaar/Shop-Borrowed loans set.
  creditDueDate?: string;
};

function computeDueDate(durationValue: number, durationUnit: DurationUnit): string {
  const d = new Date();
  if (durationUnit === "DAYS") d.setDate(d.getDate() + durationValue);
  else if (durationUnit === "WEEKS") d.setDate(d.getDate() + durationValue * 7);
  else d.setMonth(d.getMonth() + durationValue);
  return toLocalDateString(d);
}

// A grain sale's own dedicated item editor — a completely separate
// component from LineItemsEditor (the Product sale's), per the
// "shopkeeper adds one entry, either a product or a grain, never
// mixed on the same sale" decision. Every product offered here is
// already GRAIN (the caller passes only grain products in), so there
// is no per-row type toggle to get confused by — this layout IS the
// grain layout. Shows quantity, settled rate, a running total per
// row, and (once the row carries Credit) a due-date duration picker.
export function GrainItemsEditor({
  products,
  items,
  onChange,
  // The sale's current combined Credit amount (from the Payment Split
  // section) — needed here only to decide WHEN to reveal the per-item
  // Credit fields (more than one item AND credit > 0) and to show the
  // running "X of Y allocated" total; the actual per-item values live
  // on each item itself (creditAmount).
  saleCreditAmount = 0,
}: {
  products: Product[];
  items: GrainItemDraft[];
  onChange: (items: GrainItemDraft[]) => void;
  saleCreditAmount?: number;
}) {
  const showPerItemCredit = items.length > 1 && saleCreditAmount > 0;
  const allocatedCredit = items.reduce((sum, item) => sum + (Number(item.creditAmount) || 0), 0);
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of products) seen.set(p.categoryId, p.category.name);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  function addItem() {
    onChange([...items, { productId: "", quantity: "", actualPrice: "", categoryId: "" }]);
  }

  function updateItem(index: number, patch: Partial<GrainItemDraft>) {
    const next = items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, ...patch };
      if (patch.productId) {
        const product = products.find((p) => p.id === patch.productId);
        const defaultPrice = product?.sellPrice ?? product?.baseRate;
        if (defaultPrice != null) updated.actualPrice = String(defaultPrice);
      }
      return updated;
    });
    onChange(next);
  }

  function updateCategory(index: number, categoryId: string) {
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
      <label>Grain items</label>
      {items.map((item, i) => {
        const product = products.find((p) => p.id === item.productId);
        const filteredProducts = item.categoryId
          ? products.filter((p) => p.categoryId === item.categoryId)
          : products;
        const rowCreditAmount = showPerItemCredit ? Number(item.creditAmount) || 0 : saleCreditAmount;
        const showDueDatePicker = rowCreditAmount > 0;
        const total = (Number(item.quantity) || 0) * (Number(item.actualPrice) || 0);

        return (
          <div key={i} style={{ marginBottom: 12 }}>
            <div className="field-row" style={{ marginBottom: 6, alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 0, flex: "0 1 180px" }}>
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
                    Select grain
                  </option>
                  {filteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit.name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0, flex: "0 1 150px" }}>
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
              <div className="field" style={{ marginBottom: 0, flex: "0 1 150px" }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Settled rate"
                  value={item.actualPrice}
                  onChange={(e) => updateItem(i, { actualPrice: e.target.value })}
                  required
                />
              </div>
              {showPerItemCredit && (
                <div className="field" style={{ marginBottom: 0, flex: "0 1 150px" }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Udhaar for this item"
                    value={item.creditAmount ?? ""}
                    onChange={(e) => updateItem(i, { creditAmount: e.target.value })}
                    required
                  />
                </div>
              )}
              <button type="button" className="icon-btn" onClick={() => removeItem(i)}>
                <svg className="icon" viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>Total: {total}</p>

            {showDueDatePicker && (
              <GrainDueDatePicker
                value={item.creditDueDate}
                onChange={(date) => updateItem(i, { creditDueDate: date })}
              />
            )}
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost" onClick={addItem}>
        + Add grain item
      </button>
      {showPerItemCredit && (
        <p
          style={{
            marginTop: 8,
            fontSize: 12.5,
            color: Math.abs(allocatedCredit - saleCreditAmount) > 0.01 ? "var(--consigned-600)" : "var(--ink-muted)",
          }}
        >
          This sale has more than one grain item — specify how much Udhaar applies to each. Allocated:{" "}
          {allocatedCredit} of {saleCreditAmount}.
        </p>
      )}
    </div>
  );
}

// The "when does the customer have to pay this Udhaar" picker for one
// grain item — a duration (value + unit), never a free date input,
// same shape LongTermLoanModal/ShopBorrowedLoanModal already use. The
// due date itself is only ever DERIVED (today + duration) and shown
// as a preview; nothing here is typed directly. Optional — a
// shopkeeper can leave it blank if there's no fixed expectation for
// this particular purchase.
function GrainDueDatePicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (date: string | undefined) => void;
}) {
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("MONTHS");

  function apply(nextValue: string, nextUnit: DurationUnit) {
    setDurationValue(nextValue);
    setDurationUnit(nextUnit);
    const parsed = Number(nextValue);
    onChange(parsed > 0 ? computeDueDate(parsed, nextUnit) : undefined);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 6,
        padding: "8px 10px",
        background: "var(--surface-muted, #f7f5f0)",
        borderRadius: 8,
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Pay back in</span>
      <input
        type="number"
        min="1"
        step="1"
        placeholder="1"
        style={{ width: 70 }}
        value={durationValue}
        onChange={(e) => apply(e.target.value, durationUnit)}
      />
      <select style={{ width: 110 }} value={durationUnit} onChange={(e) => apply(durationValue, e.target.value as DurationUnit)}>
        <option value="DAYS">Days</option>
        <option value="WEEKS">Weeks</option>
        <option value="MONTHS">Months</option>
      </select>
      {value && (
        <span style={{ fontSize: 12.5, color: "var(--ink)" }}>
          Due <strong>{new Date(value).toLocaleDateString("en-PK")}</strong>
        </span>
      )}
    </div>
  );
}
