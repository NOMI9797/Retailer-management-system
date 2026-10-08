"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/shared/toastStore";
import type { ActionResult } from "@/lib/actionResult";

type SimpleListItem = { id: string; name: string; isActive?: boolean };

// A callback may still return a plain value (pre-existing callers not
// yet converted) or an ActionResult (converted ones) — checked at
// runtime via the shape itself, so this component works for both
// during the module-by-module rollout without forcing every caller to
// convert at once.
function isActionResult(value: unknown): value is ActionResult<unknown> {
  return typeof value === "object" && value !== null && "success" in value;
}

// Shared list manager for entities that are essentially "a name" —
// Categories and Units (which also have isActive/deactivate) and
// Areas (which don't — no onToggleActive means the active column and
// button are omitted entirely rather than faked). Add, inline rename,
// and optional deactivate, all through callbacks the caller wires to
// its own Server Actions. Account Types isn't built on this since it
// carries extra fields (code, isLoan, custom fields) the simple shape
// doesn't fit.
export function SimpleListManager<T extends SimpleListItem>({
  items,
  itemLabel,
  onCreate,
  onRename,
  onToggleActive,
  onDelete,
}: {
  items: T[];
  itemLabel: string;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onToggleActive?: (id: string, isActive: boolean) => Promise<unknown>;
  // Omitted entirely means no Delete button at all — not every caller
  // necessarily wants one, same "button only appears if the callback
  // is wired" convention onToggleActive already follows.
  onDelete?: (id: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Which item's Delete button is in the "Confirm?" state — only ever
  // one at a time, same reasoning DeleteExpenseButton/
  // DeleteSaleButton use a local confirming flag instead of a native
  // confirm() dialog.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await onCreate(newName);
      if (isActionResult(result) && !result.success) {
        setError(result.error);
        return;
      }
      showToast(`${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} added — ${newName}`);
      setNewName("");
      router.refresh();
    } catch {
      setError(`Failed to add ${itemLabel}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRename(id: string) {
    setError(null);
    try {
      const result = await onRename(id, editingName);
      if (isActionResult(result) && !result.success) {
        setError(result.error);
        return;
      }
      showToast(`${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} renamed`);
      setEditingId(null);
      router.refresh();
    } catch {
      setError(`Failed to rename ${itemLabel}`);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    if (!onToggleActive) return;
    setError(null);
    try {
      const result = await onToggleActive(id, isActive);
      if (isActionResult(result) && !result.success) {
        setError(result.error);
        return;
      }
      showToast(isActive ? `${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} deactivated` : `${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} activated`);
      router.refresh();
    } catch {
      setError(`Failed to update ${itemLabel}`);
    }
  }

  async function handleDelete(id: string) {
    if (!onDelete) return;
    setError(null);
    setIsDeleting(true);
    try {
      const result = await onDelete(id);
      if (isActionResult(result) && !result.success) {
        setError(result.error);
        setConfirmingDeleteId(null);
        return;
      }
      showToast(`${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} deleted`);
      setConfirmingDeleteId(null);
      router.refresh();
    } catch {
      setError(`Failed to delete ${itemLabel}`);
      setConfirmingDeleteId(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="panel">
      <form onSubmit={handleAdd} className="add-row">
        <input
          type="text"
          placeholder={`New ${itemLabel} name`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          Add
        </button>
      </form>

      {error && (
        <p className="form-banner error" style={{ margin: "0 20px 14px" }}>
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5, padding: "14px 20px" }}>No {itemLabel}s yet.</p>
      ) : (
        items.map((item) => (
          <div className="list-row" key={item.id}>
            {editingId === item.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                autoFocus
                style={{ flex: 1, marginRight: 12 }}
              />
            ) : (
              <div className="list-row-name" style={{ opacity: item.isActive === false ? 0.6 : 1 }}>
                {item.name}
                {onToggleActive && (
                  <span className={`status-badge${item.isActive ? "" : " inactive"}`}>
                    {item.isActive ? "Active" : "Inactive"}
                  </span>
                )}
              </div>
            )}
            <div className="row-actions">
              {editingId === item.id ? (
                <>
                  <button className="btn btn-ghost" onClick={() => handleRename(item.id)}>
                    Save
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </>
              ) : confirmingDeleteId === item.id ? (
                <>
                  <span style={{ fontSize: 12.5, color: "var(--consigned-600)", marginRight: 4 }}>Delete?</span>
                  <button className="btn btn-primary" onClick={() => handleDelete(item.id)} disabled={isDeleting}>
                    {isDeleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirmingDeleteId(null)} disabled={isDeleting}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingName(item.name);
                    }}
                  >
                    Rename
                  </button>
                  {onToggleActive && (
                    <button className="btn btn-ghost" onClick={() => handleToggle(item.id, item.isActive!)}>
                      {item.isActive ? "Deactivate" : "Activate"}
                    </button>
                  )}
                  {onDelete && (
                    <button className="btn btn-ghost" onClick={() => setConfirmingDeleteId(item.id)}>
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
