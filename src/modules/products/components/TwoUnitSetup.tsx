"use client";

// "Sold in two units" on the product form: tick it, pick the small unit
// and say how many of it make one main unit (1 Bag = 50 Kgs). From then
// on every sale / purchase of the product offers both units; stock and
// prices stay per main unit (the small-unit price is worked out).
export function TwoUnitSetup({
  units,
  mainUnitId,
  enabled,
  subUnitId,
  perUnit,
  onChange,
}: {
  units: { id: string; name: string }[];
  mainUnitId: string;
  enabled: boolean;
  subUnitId: string;
  perUnit: string;
  onChange: (next: { enabled: boolean; subUnitId: string; perUnit: string }) => void;
}) {
  const mainName = units.find((u) => u.id === mainUnitId)?.name ?? "unit";
  const subName = units.find((u) => u.id === subUnitId)?.name ?? "small unit";
  return (
    <div className="field">
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 500 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({ enabled: e.target.checked, subUnitId, perUnit })}
          style={{ width: "auto" }}
        />
        Sold in two units (e.g. Bag and Kgs)
      </label>
      {enabled && (
        <div className="field-row" style={{ marginTop: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Small unit</label>
            <select
              value={subUnitId}
              onChange={(e) => onChange({ enabled, subUnitId: e.target.value, perUnit })}
              required
            >
              <option value="" disabled>
                Select small unit
              </option>
              {units
                .filter((u) => u.id !== mainUnitId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              1 {mainName} = how many {subName}?
            </label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 50"
              value={perUnit}
              onChange={(e) => onChange({ enabled, subUnitId, perUnit: e.target.value })}
              required
            />
          </div>
        </div>
      )}
    </div>
  );
}

// "= Rs 50 per Kgs" under a price typed per main unit.
export function SubUnitPriceHint({
  price,
  perUnit,
  subName,
}: {
  price: string;
  perUnit: string;
  subName: string;
}) {
  const p = Number(price);
  const n = Number(perUnit);
  if (!(p > 0) || !(n > 0)) return null;
  return (
    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
      = Rs {Math.round((p / n) * 100) / 100} per {subName}
    </p>
  );
}
