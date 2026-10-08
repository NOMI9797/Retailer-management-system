"use client";

import { SimpleListManager } from "./SimpleListManager";
import { createArea, updateArea, deleteArea } from "../areas.actions";
import type { listAreas } from "../areas.actions";

// Thin adapter — same pattern as CategoryListManager/UnitListManager.
export function AreaListManager({ areas }: { areas: Awaited<ReturnType<typeof listAreas>> }) {
  return (
    <SimpleListManager
      items={areas}
      itemLabel="area"
      onCreate={(name) => createArea({ name })}
      onRename={(id, name) => updateArea({ id, name })}
      onToggleActive={(id, isActive) => updateArea({ id, isActive: !isActive })}
      onDelete={(id) => deleteArea(id)}
    />
  );
}
