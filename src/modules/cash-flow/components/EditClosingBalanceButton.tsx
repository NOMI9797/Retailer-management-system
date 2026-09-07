"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editClosingBalance } from "../actions";

// Corrects a day's actual closing after the fact (e.g. a miscount
// noticed later) — only shown once a day has already been closed
// (editClosingBalance requires an existing register row; use the
// day-close form for the first count). Recomputes this day's own
// variance and cascades forward through every later day that derived
// its opening balance from this one, stopping at the first manually
// overridden day.
export function EditClosingBalanceButton({ date, actualClosing }: { date: string; actualClosing: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(actualClosing));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      await editClosingBalance({ date, actualClosing: Number(value) });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ marginTop: 8 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: "6px 12px", fontSize: 12 }}
            onClick={() => {
              setEditing(false);
              setValue(String(actualClosing));
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
        {error && <p style={{ fontSize: 11.5, color: "var(--consigned-600)", marginTop: 6 }}>{error}</p>}
      </div>
    );
  }

  return (
    <button
      className="icon-btn"
      style={{ marginTop: 4 }}
      onClick={() => {
        setValue(String(actualClosing));
        setEditing(true);
      }}
      title="Edit actual closing"
    >
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
      </svg>
    </button>
  );
}
