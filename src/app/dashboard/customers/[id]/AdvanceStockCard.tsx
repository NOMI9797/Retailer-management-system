"use client";

import { useState } from "react";

export type AdvanceStockByGrain = {
  productId: string;
  name: string;
  unitName: string;
  // Still at their home.
  remaining: number;
  bought: number;
  pickedUp: number;
  soldFromHome: number;
};

// Advance stock at this customer's home — the shop's grain still lying
// there, one grain at a time (picked from the dropdown).
export function AdvanceStockCard({
  grains,
  selectedGrain,
}: {
  grains: AdvanceStockByGrain[];
  // The grain picked in the page's filter, if it's one of theirs.
  selectedGrain?: string;
}) {
  const [productId, setProductId] = useState(
    (grains.find((g) => g.productId === selectedGrain) ?? grains.find((g) => g.remaining > 0) ?? grains[0])
      ?.productId ?? ""
  );
  const g = grains.find((x) => x.productId === productId) ?? grains[0];
  if (!g) return null;

  return (
    <div className="stat-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <p className="stat-label" style={{ margin: 0 }}>
          Advance stock
        </p>
        <select
          value={g.productId}
          onChange={(e) => setProductId(e.target.value)}
          aria-label="Grain"
          style={{ width: "auto", padding: "4px 8px", fontSize: 13 }}
        >
          {grains.map((x) => (
            <option key={x.productId} value={x.productId}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <p className={`stat-value${g.remaining > 0 ? " tone-grain" : ""}`}>
        {g.remaining} {g.unitName}
      </p>
    </div>
  );
}
