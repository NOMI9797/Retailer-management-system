"use client";

import { useState } from "react";
import { createAccountType } from "../accountTypes.actions";
import type { AccountTypeFieldInput } from "../schema";

const FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN"] as const;

// Custom fields (e.g. "guarantor name" for Loan) are added/removed
// dynamically before submit — the whole form is one client component
// since every part of it (name, code, tracksQuantity, the field list)
// is user input with no server data dependency of its own.
export function AccountTypeForm({ onSaved }: { onSaved?: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [tracksQuantity, setTracksQuantity] = useState(false);
  const [fields, setFields] = useState<AccountTypeFieldInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function addField() {
    setFields((prev) => [
      ...prev,
      { fieldName: "", fieldLabel: "", fieldType: "TEXT", isRequired: false, displayOrder: prev.length },
    ]);
  }

  function updateField(index: number, patch: Partial<AccountTypeFieldInput>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await createAccountType({
        name,
        code: code.toUpperCase(),
        tracksQuantity,
        fields,
      });
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account type");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field-row">
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            placeholder="e.g. Consignment — Wheat"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Code</label>
          <input
            type="text"
            placeholder="e.g. CONSIGN_WHEAT"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={tracksQuantity}
            onChange={(e) => setTracksQuantity(e.target.checked)}
            style={{ width: "auto" }}
          />
          Tracks quantity (grain-style accounts)
        </label>
      </div>

      <div className="field">
        <label>Custom fields</label>
        {fields.map((field, i) => (
          <div key={i} className="field-row" style={{ marginBottom: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                type="text"
                placeholder="Field name (e.g. guarantorName)"
                value={field.fieldName}
                onChange={(e) => updateField(i, { fieldName: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                type="text"
                placeholder="Label (e.g. Guarantor name)"
                value={field.fieldLabel}
                onChange={(e) => updateField(i, { fieldLabel: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <select
                value={field.fieldType}
                onChange={(e) =>
                  updateField(i, { fieldType: e.target.value as AccountTypeFieldInput["fieldType"] })
                }
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={field.isRequired}
                onChange={(e) => updateField(i, { isRequired: e.target.checked })}
                style={{ width: "auto" }}
              />
              Required
            </label>
            <button type="button" className="icon-btn" onClick={() => removeField(i)}>
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={addField}>
          + Add custom field
        </button>
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save account type"}
        </button>
      </div>
    </form>
  );
}
