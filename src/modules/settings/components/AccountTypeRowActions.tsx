"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAccountType, deleteAccountType } from "../accountTypes.actions";
import { showToast } from "@/components/shared/toastStore";
import type { listAccountTypes } from "../accountTypes.actions";

type AccountType = Awaited<ReturnType<typeof listAccountTypes>>[number];

// The one client leaf per row — toggling active/inactive and
// deleting both need an onClick, everything else about the row is
// server-rendered.
export function AccountTypeRowActions({ accountType }: { accountType: AccountType }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function toggleActive() {
    setIsSaving(true);
    try {
      const result = await updateAccountType({ id: accountType.id, isActive: !accountType.isActive });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      showToast(accountType.isActive ? "Account type deactivated" : "Account type activated");
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsSaving(true);
    try {
      const result = await deleteAccountType(accountType.id);
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      showToast("Account type deleted");
      router.refresh();
    } finally {
      setIsSaving(false);
      setConfirmingDelete(false);
    }
  }

  if (confirmingDelete) {
    return (
      <>
        <span style={{ fontSize: 12.5, color: "var(--consigned-600)", marginRight: 4 }}>Delete?</span>
        <button className="btn btn-primary" onClick={handleDelete} disabled={isSaving}>
          {isSaving ? "Deleting…" : "Yes, delete"}
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} disabled={isSaving}>
          Cancel
        </button>
      </>
    );
  }

  return (
    <>
      <button className="btn btn-ghost" onClick={toggleActive} disabled={isSaving}>
        {accountType.isActive ? "Deactivate" : "Activate"}
      </button>
      <button className="btn btn-ghost" onClick={() => setConfirmingDelete(true)} disabled={isSaving}>
        Delete
      </button>
    </>
  );
}
