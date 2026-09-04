"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SimpleListItem = { id: string; name: string; isActive: boolean };

// Shared list manager for entities that are just "name + isActive"
// (Categories, Units) — add, inline rename, and deactivate/activate,
// all through the three callbacks the caller wires to its own Server
// Actions. Account Types isn't built on this since it carries extra
// fields (code, tracksQuantity, custom fields) the simple shape
// doesn't fit.
export function SimpleListManager<T extends SimpleListItem>({
  items,
  itemLabel,
  onCreate,
  onRename,
  onToggleActive,
}: {
  items: T[];
  itemLabel: string;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onToggleActive: (id: string, isActive: boolean) => Promise<unknown>;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await onCreate(newName);
      setNewName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to add ${itemLabel}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRename(id: string) {
    setError(null);
    try {
      await onRename(id, editingName);
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to rename ${itemLabel}`);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    setError(null);
    try {
      await onToggleActive(id, isActive);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update ${itemLabel}`);
    }
  }

  return (
    <div className="panel" style={{ padding: 16 }}>
      <form onSubmit={handleAdd} className="field-row" style={{ marginBottom: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <input
            type="text"
            placeholder={`New ${itemLabel} name`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          Add
        </button>
      </form>

      {error && <p className="form-banner error">{error}</p>}

      {items.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>No {itemLabel}s yet.</p>
      ) : (
        <table>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {editingId === item.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <span style={{ opacity: item.isActive ? 1 : 0.5 }}>{item.name}</span>
                  )}
                </td>
                <td>
                  <span className="cat-pill">{item.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td>
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
                        <button
                          className="btn btn-ghost"
                          onClick={() => handleToggle(item.id, item.isActive)}
                        >
                          {item.isActive ? "Deactivate" : "Activate"}
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
    </div>
  );
}
