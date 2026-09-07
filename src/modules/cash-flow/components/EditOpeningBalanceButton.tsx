"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editOpeningBalance } from "../actions";

// Overrides a day's opening balance whether it was derived from the
// prior day's closing or previously set manually — works on any day,
// closed or not (editOpeningBalance recomputes expectedClosing/
// variance immediately so the numbers stay consistent either way).
export function EditOpeningBalanceButton({ date, openingBalance }: { date: string; openingBalance: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(openingBalance));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      await editOpeningBalance({ date, openingBalance: Number(value) });
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
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
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
              setValue(String(openingBalance));
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p style={{ fontSize: 11.5, color: "var(--consigned-600)", marginTop: 6 }}>{error}</p>
        )}
      </div>
    );
  }

  return (
    <button
      className="icon-btn"
      style={{ marginTop: 4 }}
      onClick={() => {
        setValue(String(openingBalance));
        setEditing(true);
      }}
      title="Edit opening balance"
    >
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
      </svg>
    </button>
  );
}
