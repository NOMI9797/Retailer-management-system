"use client";

import { SimpleListManager } from "./SimpleListManager";
import { createArea, updateArea } from "../areas.actions";
import type { listAreas } from "../areas.actions";

// Thin adapter — same pattern as CategoryListManager/UnitListManager,
// but no onToggleActive since Area has no isActive field (flat list,
// no deactivate).
export function AreaListManager({ areas }: { areas: Awaited<ReturnType<typeof listAreas>> }) {
  return (
    <SimpleListManager
      items={areas}
      itemLabel="area"
      onCreate={(name) => createArea({ name })}
      onRename={(id, name) => updateArea({ id, name })}
    />
  );
}
