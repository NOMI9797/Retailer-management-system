"use client";

import { SimpleListManager } from "./SimpleListManager";
import { createCategory, updateCategory } from "@/modules/products/actions";
import type { listCategories } from "@/modules/products/actions";

// Thin adapter — SimpleListManager doesn't know about Category
// specifically, this just wires its generic callbacks to the real
// Server Actions.
export function CategoryListManager({
  categories,
}: {
  categories: Awaited<ReturnType<typeof listCategories>>;
}) {
  return (
    <SimpleListManager
      items={categories}
      itemLabel="category"
      onCreate={(name) => createCategory({ name })}
      onRename={(id, name) => updateCategory({ id, name })}
      onToggleActive={(id, isActive) => updateCategory({ id, isActive: !isActive })}
    />
  );
}
