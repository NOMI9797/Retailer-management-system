"use client";

import { useEffect, useState } from "react";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";
import { listShopExpenseUdhaar, getShopExpenseUdhaarSummary } from "@/modules/expenses/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { CustomerUdhaarPaymentPanel, ShopUdhaarPaymentPanel } from "@/modules/customers/components/CustomerUdhaarPayment";
import { PayExpenseDebtModal } from "@/modules/expenses/components/PayExpenseDebtModal";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
type AccountType = Awaited<ReturnType<typeof listAccountTypes>>[number];
type ExistingCustomer = ReturnType<typeof useCustomers>["customers"][number];
type ExpenseUdhaarRows = Awaited<ReturnType<typeof listShopExpenseUdhaar>>;

// Top-level split by WHO owes: "Customer Udhaar" (everything the
// customer owes the shop) and "Shop Udhaar" — either what the shop owes
// a customer (borrowed money and grain bought on Udhaar, together) or
// its Daily/Monthly expense Udhaar. Customer-related Udhaar is cleared
// by ONE total payment either way, spread over every entry oldest
// first (CustomerUdhaarPaymentPanel / ShopUdhaarPaymentPanel); expense
// Udhaar keeps its per-expense pay buttons.
export function UdhaarClearanceForm({
  areas,
  accountTypes,
  bankAccounts = [],
  initialTab = "customer",
  initialCustomer,
}: {
  areas: Area[];
  accountTypes: AccountType[];
  bankAccounts?: { id: string; name: string }[];
  // The New entry screen opens straight on "shop" from its Debit side.
  initialTab?: "customer" | "shop";
  // Opens with this customer already picked (New entry's person-first flow).
  initialCustomer?: { id: string; name: string };
}) {
  const [mainTab, setMainTab] = useState<"customer" | "shop">(initialTab);
  const [shopType, setShopType] = useState<"customer" | "expenses" | null>(initialCustomer ? "customer" : null);

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`tab${mainTab === "customer" ? " active" : ""}`}
          onClick={() => setMainTab("customer")}
        >
          Customer Udhaar
        </button>
        <button
          type="button"
          className={`tab${mainTab === "shop" ? " active" : ""}`}
          onClick={() => {
            setMainTab("shop");
            setShopType(null);
          }}
        >
          Shop Udhaar
        </button>
      </div>

      {mainTab === "customer" ? (
        <CustomerUdhaarPanel
          areas={areas}
          accountTypes={accountTypes}
          bankAccounts={bankAccounts}
          initialCustomer={initialCustomer}
        />
      ) : shopType === null ? (
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => setShopType("customer")}>
            Owed to a customer (borrowed money &amp; grain)
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShopType("expenses")}>
            Daily/Monthly Udhaar
          </button>
        </div>
      ) : shopType === "expenses" ? (
        <ExpenseUdhaarPanel onBack={() => setShopType(null)} bankAccounts={bankAccounts} />
      ) : (
        <ShopUdhaarPanel
          areas={areas}
          accountTypes={accountTypes}
          onBack={() => setShopType(null)}
          bankAccounts={bankAccounts}
          initialCustomer={initialCustomer}
        />
      )}
    </div>
  );
}

// A small shared search-a-customer widget both panels below use —
// same filter shape Customers/Daily Sales already use. Kept generic
// over what happens after a pick (onSelect) rather than baked into
// either panel, so there's exactly one implementation of "find a
// customer by name/phone/area/account-type."
function CustomerSearch({
  areas,
  accountTypes,
  onSelect,
}: {
  areas: Area[];
  accountTypes: AccountType[];
  onSelect: (customer: ExistingCustomer) => void;
}) {
  const [query, setQuery] = useState("");
  const [areaId, setAreaId] = useState("");
  const [accountTypeId, setAccountTypeId] = useState("");

  const { customers, isLoading } = useCustomers(
    query.length >= 2 ? query : undefined,
    areaId || undefined,
    accountTypeId || undefined
  );

  return (
    <div>
      <div className="field-row">
        <div className="field" style={{ flex: 1 }}>
          <label>Search by name or phone</label>
          <input
            type="text"
            placeholder="Type at least 2 characters…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Area</label>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Account type</label>
          <select value={accountTypeId} onChange={(e) => setAccountTypeId(e.target.value)}>
            <option value="">All account types</option>
            {accountTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(query.length >= 2 || areaId || accountTypeId) && (
        <div className="panel" style={{ overflow: "hidden", marginTop: 8 }}>
          {isLoading ? (
            <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>Searching…</p>
          ) : customers.length === 0 ? (
            <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>No customers match.</p>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
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
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CustomerHeader({
  customer,
  onBack,
}: {
  customer: { name: string; phone?: string | null };
  onBack: () => void;
}) {
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Search a different customer
      </button>
      <div className="cust-header" style={{ marginBottom: 20 }}>
        <div className="cust-avatar-lg">{customer.name.charAt(0).toUpperCase()}</div>
        <div>
          <h1 style={{ fontSize: 20 }}>{customer.name}</h1>
          <p>{customer.phone || "No phone"}</p>
        </div>
      </div>
    </>
  );
}

// "Customer Udhaar" tab's content — search a customer, then one
// payment for everything they owe the shop (CustomerUdhaarPaymentPanel
// spreads it over their entries oldest-first).
function CustomerUdhaarPanel({
  areas,
  accountTypes,
  bankAccounts,
  initialCustomer,
}: {
  areas: Area[];
  accountTypes: AccountType[];
  bankAccounts: { id: string; name: string }[];
  initialCustomer?: { id: string; name: string };
}) {
  const [selected, setSelected] = useState<{ id: string; name: string; phone?: string | null } | null>(
    initialCustomer ?? null
  );

  if (!selected) {
    return <CustomerSearch areas={areas} accountTypes={accountTypes} onSelect={setSelected} />;
  }

  return (
    <div>
      <CustomerHeader customer={selected} onBack={() => setSelected(null)} />
      <CustomerUdhaarPaymentPanel key={selected.id} customerId={selected.id} bankAccounts={bankAccounts} />
    </div>
  );
}

// "Shop Udhaar" → "Owed to a customer": search a customer, then one
// repayment for everything the shop owes them (ShopUdhaarPaymentPanel).
function ShopUdhaarPanel({
  areas,
  accountTypes,
  onBack,
  bankAccounts,
  initialCustomer,
}: {
  areas: Area[];
  accountTypes: AccountType[];
  onBack: () => void;
  bankAccounts: { id: string; name: string }[];
  initialCustomer?: { id: string; name: string };
}) {
  const [selected, setSelected] = useState<{ id: string; name: string; phone?: string | null } | null>(
    initialCustomer ?? null
  );

  if (!selected) {
    return (
      <div>
        <button type="button" className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>
          <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Choose a different type
        </button>
        <h2 className="section-title">Owed to a customer</h2>
        <CustomerSearch areas={areas} accountTypes={accountTypes} onSelect={setSelected} />
      </div>
    );
  }

  return (
    <div>
      <CustomerHeader customer={selected} onBack={() => setSelected(null)} />
      <ShopUdhaarPaymentPanel key={selected.id} customerId={selected.id} bankAccounts={bankAccounts} />
    </div>
  );
}

// Udhaar clearance for ONE known customer — the customer detail page's
// version of this screen, for one direction at a time (`side`), so a
// payment is recorded as a payment, never as an opposite-direction
// import. Either way it's one total, spread over every entry oldest
// first.
export function CustomerUdhaarClearance({
  customer,
  side,
  bankAccounts,
}: {
  customer: { id: string; name: string };
  side: "CUSTOMER" | "SHOP";
  bankAccounts: { id: string; name: string }[];
}) {
  return side === "CUSTOMER" ? (
    <CustomerUdhaarPaymentPanel customerId={customer.id} bankAccounts={bankAccounts} />
  ) : (
    <ShopUdhaarPaymentPanel customerId={customer.id} bankAccounts={bankAccounts} />
  );
}

// "Daily/Monthly Udhaar" — unpaid Credit expenses (rent, wages,
// supplier bills, ...). Unlike the other two Shop Udhaar types, this
// one has NO customer to search for — an expense isn't tied to any
// customer — so it skips straight to the list, same data/actions the
// Debts page's own "Daily/Monthly Udhaar" subtab already uses
// (listShopExpenseUdhaar/payExpenseDebt), just reachable from this
// one combined screen too.
function ExpenseUdhaarPanel({
  onBack,
  bankAccounts,
}: {
  onBack: () => void;
  bankAccounts: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<ExpenseUdhaarRows | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      setRows(await listShopExpenseUdhaar());
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalRemaining = rows?.reduce((sum, r) => sum + r.remaining, 0) ?? 0;

  return (
    <div>
      <button type="button" className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Choose a different type
      </button>
      <h2 className="section-title">Daily/Monthly Udhaar</h2>

      {isLoading || !rows ? (
        <p style={{ color: "var(--ink-muted)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="panel">
          <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
            No outstanding Daily/Monthly Udhaar right now.
          </p>
        </div>
      ) : (
        <section className="panel" style={{ padding: 16 }}>
          <div className="stat-grid customers-stat-grid" style={{ marginBottom: 12 }}>
            <div className="stat-card">
              <p className="stat-label">Total owed</p>
              <p className="stat-value" style={{ color: "var(--consigned-600)" }}>
                {formatMoney(totalRemaining)}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderTop: "0.5px solid var(--border)",
                }}
              >
                <span>
                  {row.description}{" "}
                  <span className={`pay-badge ${row.expenseType === "MONTHLY" ? "pay-account" : "pay-mixed"}`}>
                    {row.expenseType === "MONTHLY" ? "Monthly" : "Daily"}
                  </span>{" "}
                  — <strong>{formatMoney(row.remaining)}</strong> remaining · {formatDate(row.expenseDate)}
                </span>
                <PayExpenseDebtModal
                  expenseId={row.id}
                  description={row.description}
                  remaining={row.remaining}
                  onDone={load}
                  bankAccounts={bankAccounts}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
