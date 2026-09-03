"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory } from "../actions";
import type { listCategories } from "../actions";

type Category = Awaited<ReturnType<typeof listCategories>>[number];

// Simple add/rename/deactivate list — lives under Settings, and feeds
// the category dropdown everywhere else (ProductForm) so the
// shopkeeper never types a category freehand. Categories arrive as a
// prop from a Server Component parent; every write calls a Server
// Action then router.refresh() to re-run that server fetch.
export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCategory({ name });
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add category");
    }
  }

  async function handleRename(id: string) {
    setError(null);
    try {
      await updateCategory({ id, name: editingName });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename category");
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setError(null);
    try {
      await updateCategory({ id, isActive: !isActive });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    }
  }

  return (
    <div className="panel" style={{ padding: 16 }}>
      <form onSubmit={handleAdd} className="field-row" style={{ marginBottom: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <input
            type="text"
            placeholder="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Add
        </button>
      </form>

      {error && <p className="form-banner error">{error}</p>}

      {categories.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>No categories yet.</p>
      ) : (
        <table>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>
                  {editingId === category.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <span style={{ opacity: category.isActive ? 1 : 0.5 }}>{category.name}</span>
                  )}
                </td>
                <td>
                  <span className="cat-pill">{category.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td>
                  <div className="row-actions">
                    {editingId === category.id ? (
                      <>
                        <button className="btn btn-ghost" onClick={() => handleRename(category.id)}>
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
                            setEditingId(category.id);
                            setEditingName(category.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => handleToggleActive(category.id, category.isActive)}
                        >
                          {category.isActive ? "Deactivate" : "Activate"}
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
