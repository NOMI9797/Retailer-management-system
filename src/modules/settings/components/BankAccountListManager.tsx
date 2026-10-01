"use client";

import { SimpleListManager } from "./SimpleListManager";
import { createBankAccount, updateBankAccount } from "../bankAccounts.actions";
import type { listBankAccounts } from "../bankAccounts.actions";

// Thin adapter — same pattern as UnitListManager/AreaListManager.
// Balance isn't shown or editable here; it's read-only derived state
// shown on the dedicated Bank Accounts page instead.
export function BankAccountListManager({
  bankAccounts,
}: {
  bankAccounts: Awaited<ReturnType<typeof listBankAccounts>>;
}) {
  return (
    <SimpleListManager
      items={bankAccounts}
      itemLabel="bank account"
      onCreate={(name) => createBankAccount({ name })}
      onRename={(id, name) => updateBankAccount({ id, name })}
      onToggleActive={(id, isActive) => updateBankAccount({ id, isActive: !isActive })}
    />
  );
}
