"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateDealer } from "../actions";
import { AddDealerModal } from "./AddDealerModal";
import { showToast } from "@/components/shared/toastStore";
import type { listDealers } from "../actions";

type Dealers = Awaited<ReturnType<typeof listDealers>>;

// Settings → Dealers tab — same "add + inline rename/deactivate"
// shape as SimpleListManager, but a dedicated table since a dealer
// also carries a type (Products/Grain) that a plain name-only list
// has no room for.
export function DealerListManager({ dealers }: { dealers: Dealers }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPhone, setEditingPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleRename(id: string) {
    setError(null);
    const response = await updateDealer({ id, name: editingName, phone: editingPhone || undefined });
    if (response && 'error' in response && !('data' in response)) {
      setError((response as { error: string }).error);
      return;
    }
    showToast("Dealer updated");
    setEditingId(null);
    router.refresh();
  }

  async function handleToggle(id: string, isActive: boolean) {
    setError(null);
    const response = await updateDealer({ id, isActive: !isActive });
    if (response && 'error' in response && !('data' in response)) {
      setError((response as { error: string }).error);
      return;
    }
    showToast(isActive ? "Dealer deactivated" : "Dealer activated");
    router.refresh();
  }

  return (
    <div className="panel">
      <div className="page-head" style={{ padding: "16px 20px 0" }}>
        <div />
        <AddDealerModal />
      </div>

      {error && (
        <p className="form-banner error" style={{ margin: "0 20px 14px" }}>
          {error}
        </p>
      )}

      {dealers.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5, padding: "14px 20px" }}>No dealers yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dealers.map((dealer) => (
              <tr key={dealer.id}>
                {editingId === dealer.id ? (
                  <>
                    <td>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                      />
                    </td>
                    <td>
                      <input type="text" value={editingPhone} onChange={(e) => setEditingPhone(e.target.value)} />
                    </td>
                    <td colSpan={2}>
                      <span className={`pay-badge ${dealer.type === "GRAIN" ? "pay-account" : "pay-mixed"}`}>
                        {dealer.type === "GRAIN" ? "Grain" : "Products"}
                      </span>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ opacity: dealer.isActive ? 1 : 0.6 }}>{dealer.name}</td>
                    <td style={{ color: "var(--ink-muted)" }}>{dealer.phone || "—"}</td>
                    <td>
                      <span className={`pay-badge ${dealer.type === "GRAIN" ? "pay-account" : "pay-mixed"}`}>
                        {dealer.type === "GRAIN" ? "Grain" : "Products"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge${dealer.isActive ? "" : " inactive"}`}>
                        {dealer.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </>
                )}
                <td style={{ textAlign: "right" }}>
                  <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                    {editingId === dealer.id ? (
                      <>
                        <button className="btn btn-ghost" onClick={() => handleRename(dealer.id)}>
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
                            setEditingId(dealer.id);
                            setEditingName(dealer.name);
                            setEditingPhone(dealer.phone ?? "");
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn btn-ghost" onClick={() => handleToggle(dealer.id, dealer.isActive)}>
                          {dealer.isActive ? "Deactivate" : "Activate"}
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
