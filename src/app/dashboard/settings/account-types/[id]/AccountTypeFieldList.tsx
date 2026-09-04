"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addAccountTypeField,
  updateAccountTypeField,
  deleteAccountTypeField,
} from "@/modules/settings/accountTypes.actions";
import type { getAccountType } from "@/modules/settings/accountTypes.actions";

const FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN"] as const;

type Field = Awaited<ReturnType<typeof getAccountType>>["fields"][number];

// Every field is editable and deletable in place, plus a form to add
// a new one — all client-side since it's all user input with no
// server data dependency beyond the initial fields prop.
export function AccountTypeFieldList({
  accountTypeId,
  fields,
}: {
  accountTypeId: string;
  fields: Field[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ fieldLabel: string; isRequired: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newField, setNewField] = useState({
    fieldName: "",
    fieldLabel: "",
    fieldType: "TEXT" as (typeof FIELD_TYPES)[number],
    isRequired: false,
  });

  function startEdit(field: Field) {
    setEditingId(field.id);
    setEditDraft({ fieldLabel: field.fieldLabel, isRequired: field.isRequired });
  }

  async function saveEdit(fieldId: string) {
    if (!editDraft) return;
    setError(null);
    setIsSaving(true);
    try {
      await updateAccountTypeField({ id: fieldId, ...editDraft });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update field");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(fieldId: string) {
    setError(null);
    setIsSaving(true);
    try {
      await deleteAccountTypeField(fieldId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete field");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await addAccountTypeField({
        accountTypeId,
        fieldName: newField.fieldName,
        fieldLabel: newField.fieldLabel,
        fieldType: newField.fieldType,
        isRequired: newField.isRequired,
        displayOrder: fields.length,
      });
      setNewField({ fieldName: "", fieldLabel: "", fieldType: "TEXT", isRequired: false });
      setShowAdd(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add field");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 16 }}>
      {error && <p className="form-banner error">{error}</p>}

      {fields.length === 0 && !showAdd ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5, marginBottom: 14 }}>
          No custom fields yet.
        </p>
      ) : (
        <table style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th>Field name</th>
              <th>Label</th>
              <th>Type</th>
              <th>Required</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.id}>
                <td>{field.fieldName}</td>
                <td>
                  {editingId === field.id ? (
                    <input
                      type="text"
                      value={editDraft?.fieldLabel ?? ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({ ...prev!, fieldLabel: e.target.value }))
                      }
                      autoFocus
                    />
                  ) : (
                    field.fieldLabel
                  )}
                </td>
                <td>{field.fieldType}</td>
                <td>
                  {editingId === field.id ? (
                    <input
                      type="checkbox"
                      checked={editDraft?.isRequired ?? false}
                      onChange={(e) =>
                        setEditDraft((prev) => ({ ...prev!, isRequired: e.target.checked }))
                      }
                      style={{ width: "auto" }}
                    />
                  ) : field.isRequired ? (
                    "Yes"
                  ) : (
                    "No"
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    {editingId === field.id ? (
                      <>
                        <button className="btn btn-ghost" onClick={() => saveEdit(field.id)} disabled={isSaving}>
                          Save
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-ghost" onClick={() => startEdit(field)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => handleDelete(field.id)}
                          disabled={isSaving}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd ? (
        <form onSubmit={handleAdd} className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Field name</label>
            <input
              type="text"
              placeholder="e.g. guarantorName"
              value={newField.fieldName}
              onChange={(e) => setNewField((f) => ({ ...f, fieldName: e.target.value }))}
              required
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Label</label>
            <input
              type="text"
              placeholder="e.g. Guarantor name"
              value={newField.fieldLabel}
              onChange={(e) => setNewField((f) => ({ ...f, fieldLabel: e.target.value }))}
              required
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select
              value={newField.fieldType}
              onChange={(e) =>
                setNewField((f) => ({ ...f, fieldType: e.target.value as (typeof FIELD_TYPES)[number] }))
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
              checked={newField.isRequired}
              onChange={(e) => setNewField((f) => ({ ...f, isRequired: e.target.checked }))}
              style={{ width: "auto" }}
            />
            Required
          </label>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            Add
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => setShowAdd(true)}>
          + Add field
        </button>
      )}
    </div>
  );
}
