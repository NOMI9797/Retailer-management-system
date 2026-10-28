"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAdvanceRegister } from "@/modules/grain-register/actions";
import { showToast } from "@/components/shared/toastStore";

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

type Grain = { id: string; name: string; unitName: string };

// Advance stock at this customer's home — the shop's grain still lying
// there, one grain at a time (picked from the dropdown). A figure typed
// in from the register (pencil, every grain at once) shows instead,
// with what the records add up to below — display only.
export function AdvanceStockCard({
  customerId,
  grains,
  allGrains,
  register,
  selectedGrain,
}: {
  customerId: string;
  // What the records add up to, per grain they have any for.
  grains: AdvanceStockByGrain[];
  // Every grain — the register form lists them all.
  allGrains: Grain[];
  // Register figures, per grain id.
  register: Record<string, number>;
  // The grain picked in the page's filter.
  selectedGrain?: string;
}) {
  // Grains to show: any with records or a register figure.
  const shown = allGrains.filter((g) => grains.some((x) => x.productId === g.id) || register[g.id] !== undefined);
  const [productId, setProductId] = useState(
    (shown.find((g) => g.id === selectedGrain) ??
      shown.find((g) => (register[g.id] ?? grains.find((x) => x.productId === g.id)?.remaining ?? 0) > 0) ??
      shown[0])?.id ?? ""
  );
  const grain = shown.find((g) => g.id === productId) ?? shown[0];
  const system = grain ? (grains.find((x) => x.productId === grain.id)?.remaining ?? 0) : 0;
  const fromRegister = grain ? register[grain.id] : undefined;
  const value = fromRegister ?? system;

  return (
    <div className="stat-card" style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingRight: 30 }}>
        <p className="stat-label" style={{ margin: 0 }}>
          Advance stock
        </p>
        {shown.length > 0 && (
          <select
            value={grain?.id}
            onChange={(e) => setProductId(e.target.value)}
            aria-label="Grain"
            style={{ width: "auto", padding: "4px 8px", fontSize: 13 }}
          >
            {shown.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className={`stat-value${value > 0 ? " tone-grain" : ""}`}>
        {value} {grain?.unitName ?? ""}
      </p>
      {fromRegister !== undefined && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
          <span className="pay-badge pay-mixed" style={{ marginRight: 6 }}>
            From register
          </span>
          System: {system} {grain?.unitName}
        </p>
      )}
      <AdvanceRegisterButton customerId={customerId} allGrains={allGrains} grains={grains} register={register} />
    </div>
  );
}

// Pencil: this customer's advance stock from the register, every grain
// in one go. Blank = no register figure for that grain (the card shows
// the system figure).
function AdvanceRegisterButton({
  customerId,
  allGrains,
  grains,
  register,
}: {
  customerId: string;
  allGrains: Grain[];
  grains: AdvanceStockByGrain[];
  register: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function openModal() {
    setValues(Object.fromEntries(allGrains.map((g) => [g.id, register[g.id] !== undefined ? String(register[g.id]) : ""])));
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await setAdvanceRegister({
      customerId,
      entries: allGrains.map((g) => ({ productId: g.id, kg: values[g.id]?.trim() ? Number(values[g.id]) : null })),
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("Advance stock from register saved");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={openModal}
        title="Enter from register"
        style={{ position: "absolute", top: 10, right: 10 }}
      >
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Advance stock at their home — from register</h2>
            <p className="modal-sub">
              Shown on this card only — the shop&apos;s own stock and every other record stay as they are. Leave a grain
              blank to show the system figure.
            </p>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}
              <div className="panel" style={{ marginBottom: 14, maxHeight: 360, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Grain</th>
                      <th style={{ textAlign: "right" }}>System</th>
                      <th style={{ width: 170 }}>From register</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allGrains.map((g) => (
                      <tr key={g.id}>
                        <td>{g.name}</td>
                        <td className="num" style={{ textAlign: "right", color: "var(--ink-muted)" }}>
                          {grains.find((x) => x.productId === g.id)?.remaining ?? 0} {g.unitName}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder={g.unitName}
                            value={values[g.id] ?? ""}
                            onChange={(e) => setValues({ ...values, [g.id]: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={isSaving}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
