"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOpeningBalance, closeDay } from "../actions";

// Two distinct actions live here depending on the day's state:
// - needsOpeningBalance: the shopkeeper has never used Cash Flow
//   before (or this is the very first tracked day) — a one-time
//   manual seed, per the milestone's "day one" decision.
// - otherwise: the normal day-close action — enter what was actually
//   counted, see the variance.
export function DayCloseForm({
  date,
  needsOpeningBalance,
  isClosed,
}: {
  date: string;
  needsOpeningBalance: boolean;
  isClosed: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      if (needsOpeningBalance) {
        await setOpeningBalance({ date, openingBalance: Number(value) });
      } else {
        await closeDay({ date, actualClosing: Number(value) });
      }
      setValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  if (isClosed) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="field-row" style={{ alignItems: "flex-end", marginTop: 12 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{needsOpeningBalance ? "Opening balance for this day" : "Actual cash counted"}</label>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={isSaving}>
        {isSaving ? "Saving…" : needsOpeningBalance ? "Set opening balance" : "Close day"}
      </button>
      {error && <span className="form-banner error">{error}</span>}
    </form>
  );
}
