"use client";

import { useEffect, useState } from "react";
import { getSavedPrinter, listPrinters, savePrinter } from "../qzClient";

// The chosen receipt printer is a per-computer setting (it's whichever
// printer is attached to THIS machine), so it lives in this browser's
// localStorage, not the database. The list is only fetched when asked
// for, so just opening the Receipts page never connects to QZ Tray.
export function PrinterPicker() {
  const [saved, setSaved] = useState<string | null>(null);
  const [printers, setPrinters] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSaved(getSavedPrinter());
  }, []);

  async function loadPrinters() {
    setIsLoading(true);
    setError(null);
    try {
      setPrinters(await listPrinters());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load printers.");
    } finally {
      setIsLoading(false);
    }
  }

  function choose(name: string) {
    savePrinter(name);
    setSaved(name);
    setPrinters(null);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>
        Printer: <strong style={{ color: "var(--ink)" }}>{saved ?? "Auto-detect"}</strong>
      </span>
      {printers ? (
        <select defaultValue="" onChange={(e) => e.target.value && choose(e.target.value)} aria-label="Receipt printer">
          <option value="" disabled>
            Choose the receipt printer…
          </option>
          {printers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={loadPrinters} disabled={isLoading}>
          {isLoading ? "Loading…" : "Change"}
        </button>
      )}
      {error && <span style={{ fontSize: 12.5, color: "var(--consigned-600)" }}>{error}</span>}
    </div>
  );
}
