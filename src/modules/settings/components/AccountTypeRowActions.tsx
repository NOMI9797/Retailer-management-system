"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAccountType } from "../accountTypes.actions";
import type { listAccountTypes } from "../accountTypes.actions";

type AccountType = Awaited<ReturnType<typeof listAccountTypes>>[number];

// The one client leaf per row — toggling active/inactive needs an
// onClick, everything else about the row is server-rendered.
export function AccountTypeRowActions({ accountType }: { accountType: AccountType }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function toggleActive() {
    setIsSaving(true);
    try {
      await updateAccountType({ id: accountType.id, isActive: !accountType.isActive });
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button className="btn btn-ghost" onClick={toggleActive} disabled={isSaving}>
      {accountType.isActive ? "Deactivate" : "Activate"}
    </button>
  );
}
