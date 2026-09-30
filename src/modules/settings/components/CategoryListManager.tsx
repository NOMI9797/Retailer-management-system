"use client";

import { SimpleListManager } from "./SimpleListManager";
import { createCategory, updateCategory } from "@/modules/products/actions";
import type { listCategories } from "@/modules/products/actions";

// Two real, separate sections — Product (Simple stock) and Grain —
// per Category.stockKind's schema comment: a category is one or the
// other from the moment it's created, never a shared flat list a
// shopkeeper could file a grain product under a merchandise category
// by mistake. Each section is its own SimpleListManager instance with
// a fixed stockKind baked into its own onCreate, so "Add" in the
// Grain section can never accidentally create a Product category or
// vice versa.
export function CategoryListManager({
  productCategories,
  grainCategories,
}: {
  productCategories: Awaited<ReturnType<typeof listCategories>>;
  grainCategories: Awaited<ReturnType<typeof listCategories>>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        alignItems: "start",
      }}
      className="category-columns"
    >
      <div>
        <h2 className="section-title">Product categories</h2>
        <SimpleListManager
          items={productCategories}
          itemLabel="category"
          onCreate={(name) => createCategory({ name, stockKind: "SIMPLE" })}
          onRename={(id, name) => updateCategory({ id, name })}
          onToggleActive={(id, isActive) => updateCategory({ id, isActive: !isActive })}
        />
      </div>

      <div>
        <h2 className="section-title">Grain categories</h2>
        <SimpleListManager
          items={grainCategories}
          itemLabel="category"
          onCreate={(name) => createCategory({ name, stockKind: "GRAIN" })}
          onRename={(id, name) => updateCategory({ id, name })}
          onToggleActive={(id, isActive) => updateCategory({ id, isActive: !isActive })}
        />
      </div>
    </div>
  );
}
