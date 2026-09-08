"use client";

import { SimpleListManager } from "./SimpleListManager";
import {
  createMonthlyExpenseType,
  updateMonthlyExpenseType,
  listMonthlyExpenseTypes,
} from "@/modules/expenses/actions";

// Thin adapter — same pattern as CategoryListManager/UnitListManager,
// wiring SimpleListManager's generic callbacks to the real Server
// Actions for the Monthly expense types list (Electricity bill, AC
// bill, Rent, ...) that the Monthly Expenses form picks from.
export function MonthlyExpenseTypeListManager({
  types,
}: {
  types: Awaited<ReturnType<typeof listMonthlyExpenseTypes>>;
}) {
  return (
    <SimpleListManager
      items={types}
      itemLabel="monthly expense type"
      onCreate={(name) => createMonthlyExpenseType(name)}
      onRename={(id, name) => updateMonthlyExpenseType(id, { name })}
      onToggleActive={(id, isActive) => updateMonthlyExpenseType(id, { isActive: !isActive })}
    />
  );
}
