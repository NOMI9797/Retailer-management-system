"use client";

import { SimpleListManager } from "./SimpleListManager";
import { createUnit, updateUnit } from "@/modules/products/actions";
import type { listUnits } from "@/modules/products/actions";

// Thin adapter — same pattern as CategoryListManager.
export function UnitListManager({ units }: { units: Awaited<ReturnType<typeof listUnits>> }) {
  return (
    <SimpleListManager
      items={units}
      itemLabel="unit"
      onCreate={(name) => createUnit({ name })}
      onRename={(id, name) => updateUnit({ id, name })}
      onToggleActive={(id, isActive) => updateUnit({ id, isActive: !isActive })}
    />
  );
}
