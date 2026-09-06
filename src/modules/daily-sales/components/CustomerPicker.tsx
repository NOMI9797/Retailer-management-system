"use client";

import { useState } from "react";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";
import { addCustomerAccount, changeCustomerAccountType, removeCustomerAccount } from "@/modules/customers/actions";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
type AccountType = Awaited<ReturnType<typeof listAccountTypes>>[number];
type ExistingCustomer = ReturnType<typeof useCustomers>["customers"][number];

export type CustomerSelection =
  | { mode: "existing"; customerId: string; name: string; accountTypeId?: string }
  | { mode: "new"; name: string; phone?: string; areaId?: string; accountTypeIds: string[] };

// Progressive disclosure, per the milestone: type a name, if a match
// exists select it and go straight to line items (the common, fast
// case) — only if nothing matches does the form expand for the rest
// (phone, area, account type), and even then only name is required.
// For an EXISTING customer, their current accounts are shown and a
// new one can be assigned right here too — a returning customer might
// now also need a second account (e.g. a Regular buyer who's started
// supplying consigned grain), and this is the moment that's noticed.
export function CustomerPicker({
  areas,
  accountTypes,
  onChange,
}: {
  areas: Area[];
  accountTypes: AccountType[];
  onChange: (selection: CustomerSelection | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ExistingCustomer | null>(null);
  const [selectedAccountTypeId, setSelectedAccountTypeId] = useState<string | undefined>(undefined);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountTypeId, setNewAccountTypeId] = useState("");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountTypeId, setEditAccountTypeId] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [removingAccountId, setRemovingAccountId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [showNewFields, setShowNewFields] = useState(false);
  const [phone, setPhone] = useState("");
  const [areaId, setAreaId] = useState("");
  const [accountTypeIds, setAccountTypeIds] = useState<string[]>([]);

  const { customers, isLoading } = useCustomers(query.length >= 2 ? query : undefined);

  function selectExisting(customer: ExistingCustomer) {
    setSelected(customer);
    setQuery(customer.name);
    setShowNewFields(false);
    setShowAddAccount(false);
    setAddAccountError(null);
    const defaultAccountTypeId = customer.accounts[0]?.accountTypeId;
    setSelectedAccountTypeId(defaultAccountTypeId);
    onChange({ mode: "existing", customerId: customer.id, name: customer.name, accountTypeId: defaultAccountTypeId });
  }

  function pickAccountForSale(accountTypeId: string) {
    if (!selected) return;
    setSelectedAccountTypeId(accountTypeId);
    onChange({ mode: "existing", customerId: selected.id, name: selected.name, accountTypeId });
  }

  async function handleAddAccount() {
    if (!selected || !newAccountTypeId) return;
    setIsAddingAccount(true);
    setAddAccountError(null);
    try {
      const accountType = accountTypes.find((t) => t.id === newAccountTypeId);
      const newAccount = await addCustomerAccount(selected.id, newAccountTypeId);
      setSelected({
        ...selected,
        accounts: [
          ...selected.accounts,
          { ...newAccount, currentBalance: 0, accountType: accountType! },
        ],
      });
      setShowAddAccount(false);
      setNewAccountTypeId("");
      pickAccountForSale(newAccountTypeId);
    } catch (err) {
      setAddAccountError(err instanceof Error ? err.message : "Failed to add account");
    } finally {
      setIsAddingAccount(false);
    }
  }

  function startEditAccount(accountId: string, currentAccountTypeId: string) {
    setEditingAccountId(accountId);
    setEditAccountTypeId(currentAccountTypeId);
    setEditError(null);
  }

  async function handleSaveEditAccount(accountId: string) {
    if (!selected || !editAccountTypeId) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const newAccountType = accountTypes.find((t) => t.id === editAccountTypeId);
      await changeCustomerAccountType(accountId, editAccountTypeId);
      const updatedAccounts = selected.accounts.map((a) =>
        a.id === accountId ? { ...a, accountTypeId: editAccountTypeId, accountType: newAccountType! } : a
      );
      setSelected({ ...selected, accounts: updatedAccounts });
      if (selectedAccountTypeId === selected.accounts.find((a) => a.id === accountId)?.accountTypeId) {
        pickAccountForSaleFrom(updatedAccounts, editAccountTypeId);
      }
      setEditingAccountId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to change account type");
    } finally {
      setIsSavingEdit(false);
    }
  }

  function pickAccountForSaleFrom(accounts: ExistingCustomer["accounts"], accountTypeId: string) {
    if (!selected) return;
    setSelectedAccountTypeId(accountTypeId);
    onChange({ mode: "existing", customerId: selected.id, name: selected.name, accountTypeId });
  }

  async function handleRemoveAccount(accountId: string) {
    if (!selected) return;
    setRemovingAccountId(accountId);
    setRemoveError(null);
    try {
      await removeCustomerAccount(accountId);
      const remaining = selected.accounts.filter((a) => a.id !== accountId);
      setSelected({ ...selected, accounts: remaining });
      const wasSelected = selected.accounts.find((a) => a.id === accountId)?.accountTypeId === selectedAccountTypeId;
      if (wasSelected) {
        const fallback = remaining[0]?.accountTypeId;
        setSelectedAccountTypeId(fallback);
        onChange({ mode: "existing", customerId: selected.id, name: selected.name, accountTypeId: fallback });
      }
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Failed to remove account");
    } finally {
      setRemovingAccountId(null);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    setShowNewFields(false);
    setShowAddAccount(false);
    onChange(null);
  }

  function useAsNewCustomer() {
    setShowNewFields(true);
    emitNew(query, phone, areaId, accountTypeIds);
  }

  function emitNew(name: string, phone: string, areaId: string, accountTypeIds: string[]) {
    if (!name.trim()) {
      onChange(null);
      return;
    }
    onChange({
      mode: "new",
      name: name.trim(),
      phone: phone || undefined,
      areaId: areaId || undefined,
      accountTypeIds,
    });
  }

  function toggleAccountType(id: string) {
    const next = accountTypeIds.includes(id)
      ? accountTypeIds.filter((x) => x !== id)
      : [...accountTypeIds, id];
    setAccountTypeIds(next);
    emitNew(query, phone, areaId, next);
  }

  const showResults = !selected && query.length >= 2;
  const noMatches = showResults && !isLoading && customers.length === 0;

  return (
    <div className="field">
      <label>Customer</label>
      <input
        type="text"
        placeholder="Type a name to search or add new…"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
      />

      {showResults && !showNewFields && (
        <div style={{ marginTop: 6 }}>
          {isLoading ? (
            <p style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>Searching…</p>
          ) : customers.length > 0 ? (
            // Clickable rows instead of a native <select size> listbox
            // — a listbox can pre-highlight its first enabled option
            // (since the placeholder option is disabled), so clicking
            // an already-highlighted row never fires onChange. Plain
            // buttons have no such ambiguity: a click always fires.
            <div className="panel" style={{ overflow: "hidden" }}>
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectExisting(c)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background: "none",
                    border: "none",
                    borderBottom: "0.5px solid var(--border)",
                    cursor: "pointer",
                    fontSize: 13.5,
                    fontFamily: "inherit",
                  }}
                >
                  {c.name}
                  {c.phone ? <span style={{ color: "var(--ink-muted)" }}> — {c.phone}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {noMatches && (
            <button type="button" className="btn btn-primary" onClick={useAsNewCustomer} style={{ marginTop: 6 }}>
              <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add &quot;{query}&quot; as a new customer
            </button>
          )}
        </div>
      )}

      {showNewFields && (
        <div style={{ marginTop: 10 }}>
          <p
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--primary-600)",
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M4 12l6 6L20 6" />
            </svg>
            New customer — &quot;{query}&quot; will be created with this sale
          </p>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Phone (optional)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  emitNew(query, e.target.value, areaId, accountTypeIds);
                }}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Area (optional)</label>
              <select
                value={areaId}
                onChange={(e) => {
                  setAreaId(e.target.value);
                  emitNew(query, phone, e.target.value, accountTypeIds);
                }}
              >
                <option value="">No area</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Account types (optional)</label>
              {accountTypes.map((t) => (
                <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={accountTypeIds.includes(t.id)}
                    onChange={() => toggleAccountType(t.id)}
                    style={{ width: "auto" }}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12.5, color: "var(--ink-muted)", marginBottom: 6 }}>
            {selected.accounts.length === 0 ? "No accounts yet" : "Account for this sale"}
          </p>

          {selected.accounts.length > 0 && (
            <div className="panel" style={{ marginBottom: 8, overflow: "hidden" }}>
              {selected.accounts.map((a) => {
                const isEditing = editingAccountId === a.id;
                // Only a client-side hint for the tooltip — the server
                // action is the real guard (it also checks transaction
                // history, which isn't loaded into this picker's data).
                const hasBalance = a.currentBalance !== 0;
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderBottom: "0.5px solid var(--border)",
                    }}
                  >
                    {isEditing ? (
                      <>
                        <select
                          value={editAccountTypeId}
                          onChange={(e) => setEditAccountTypeId(e.target.value)}
                          style={{ flex: 1 }}
                        >
                          {accountTypes
                            .filter((t) => t.id === a.accountTypeId || !selected.accounts.some((x) => x.accountTypeId === t.id))
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={isSavingEdit}
                          onClick={() => handleSaveEditAccount(a.id)}
                        >
                          {isSavingEdit ? "Saving…" : "Save"}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setEditingAccountId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => pickAccountForSale(a.accountTypeId)}
                          style={{
                            flex: 1,
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 13.5,
                            fontWeight: selectedAccountTypeId === a.accountTypeId ? 600 : 400,
                            color: selectedAccountTypeId === a.accountTypeId ? "var(--primary-600)" : "var(--ink)",
                          }}
                        >
                          {a.accountType.name}
                          {selectedAccountTypeId === a.accountTypeId ? " (selected)" : ""}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => startEditAccount(a.id, a.accountTypeId)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={removingAccountId === a.id}
                          onClick={() => handleRemoveAccount(a.id)}
                          title={hasBalance ? "Accounts with a balance or history can't be removed" : undefined}
                        >
                          {removingAccountId === a.id ? "Removing…" : "Remove"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {editError && (
            <p className="form-banner error" style={{ marginTop: 6 }}>
              {editError}
            </p>
          )}
          {removeError && (
            <p className="form-banner error" style={{ marginTop: 6 }}>
              {removeError}
            </p>
          )}

          {showAddAccount ? (
            <div className="field-row" style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                <select value={newAccountTypeId} onChange={(e) => setNewAccountTypeId(e.target.value)}>
                  <option value="">Select account type</option>
                  {accountTypes
                    .filter((t) => !selected.accounts.some((a) => a.accountTypeId === t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginBottom: 0 }}
                disabled={!newAccountTypeId || isAddingAccount}
                onClick={handleAddAccount}
              >
                {isAddingAccount ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginBottom: 0 }}
                onClick={() => setShowAddAccount(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setShowAddAccount(true)}>
              <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {selected.accounts.length === 0 ? "Add an account" : "Assign another account"}
            </button>
          )}

          {addAccountError && (
            <p className="form-banner error" style={{ marginTop: 6 }}>
              {addAccountError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
