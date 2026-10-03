"use client";

import type { listDealers } from "../actions";

// A plain select for picking a dealer as a sale's buyer — unlike
// CustomerPicker, there's no "add new" path here: dealers are
// Settings-managed (see Settings → Dealers), so a sale always picks
// from the existing list rather than creating one on the fly.
export function DealerPicker({
  dealers,
  value,
  onChange,
}: {
  dealers: Awaited<ReturnType<typeof listDealers>>;
  value: string;
  onChange: (dealerId: string) => void;
}) {
  return (
    <div className="field">
      <label>Dealer</label>
      {dealers.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>
          No dealers yet — add one in Settings → Dealers.
        </p>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} required>
          <option value="" disabled>
            Select a dealer
          </option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
