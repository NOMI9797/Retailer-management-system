"use client";

import { useEffect, useState } from "react";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";
import { getCustomerUdhaarSummary } from "@/modules/debts/actions";
import { getShopOwedForGrainByProduct } from "@/modules/stock/actions";
import { getCustomerGrainCreditPurchases } from "@/modules/daily-sales/actions";
import { getCustomerShopBorrowedHistory } from "@/modules/customers/actions";
import { listShopExpenseUdhaar, getShopExpenseUdhaarSummary } from "@/modules/expenses/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { RecordAccountTransactionModal } from "@/modules/customers/components/RecordAccountTransactionModal";
import { PayGrainDebtModal } from "@/modules/stock/components/PayGrainDebtModal";
import { PayGrainSaleItemCreditModal } from "@/modules/daily-sales/components/PayGrainSaleItemCreditModal";
import { PayShopBorrowedLoanModal } from "@/modules/customers/components/PayShopBorrowedLoanModal";
import { PayExpenseDebtModal } from "@/modules/expenses/components/PayExpenseDebtModal";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import type { DebtRow } from "@/modules/debts/schema";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
type AccountType = Awaited<ReturnType<typeof listAccountTypes>>[number];
type ExistingCustomer = ReturnType<typeof useCustomers>["customers"][number];
type GrainOwed = Awaited<ReturnType<typeof getShopOwedForGrainByProduct>>;
type GrainCreditRows = Awaited<ReturnType<typeof getCustomerGrainCreditPurchases>>;
type ShopBorrowedHistory = Awaited<ReturnType<typeof getCustomerShopBorrowedHistory>>;
type ExpenseUdhaarRows = Awaited<ReturnType<typeof listShopExpenseUdhaar>>;

type CustomerSummary = {
  regular: DebtRow | null;
  longTerm: DebtRow | null;
  grainCredit: GrainCreditRows;
};

// Top-level split by WHO picks first, per the "type-wise, then pick
// the customer" request: "Customer Udhaar" goes straight into the
// existing search-a-customer flow (everywhere the CUSTOMER owes the
// shop — Regular, Long-term, Grain credit); "Shop Udhaar" asks WHICH
// kind of shop debt first ("Borrowed from customer" or "Stock/Grain
// Udhaar"), then searches a customer scoped to just that one type.
// Each leaf section's "Record payment" is wired to the SAME action
// every other screen in the app already uses for that specific Udhaar
// type (never a new payment mechanism), so a payment recorded here
// shows up identically wherever else that section is also displayed
// (Debts page, Grain page, customer's own profile).
export function UdhaarClearanceForm({ areas, accountTypes }: { areas: Area[]; accountTypes: AccountType[] }) {
  const [mainTab, setMainTab] = useState<"customer" | "shop">("customer");
  const [shopType, setShopType] = useState<"borrowed" | "grain" | "expenses" | null>(null);

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
        <CustomerUdhaarPanel areas={areas} accountTypes={accountTypes} />
      ) : shopType === null ? (
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => setShopType("borrowed")}>
            Borrowed from customer
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShopType("grain")}>
            Stock/Grain Udhaar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShopType("expenses")}>
            Daily/Monthly Udhaar
          </button>
        </div>
      ) : shopType === "expenses" ? (
        <ExpenseUdhaarPanel onBack={() => setShopType(null)} />
      ) : (
        <ShopUdhaarPanel
          areas={areas}
          accountTypes={accountTypes}
          shopType={shopType}
          onBack={() => setShopType(null)}
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

function CustomerHeader({ customer, onBack }: { customer: ExistingCustomer; onBack: () => void }) {
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

// "Customer Udhaar" tab's content — search a customer, then show
// every section where the CUSTOMER owes the shop: Regular Udhaar,
// Long-term Udhaar, and Customer Udhaar for Grain.
function CustomerUdhaarPanel({ areas, accountTypes }: { areas: Area[]; accountTypes: AccountType[] }) {
  const [selected, setSelected] = useState<ExistingCustomer | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  async function loadSummary(customerId: string) {
    setIsLoadingSummary(true);
    try {
      const [regular, longTerm, grainCredit] = await Promise.all([
        getCustomerUdhaarSummary(customerId, "REGULAR"),
        getCustomerUdhaarSummary(customerId, "LONG_TERM"),
        getCustomerGrainCreditPurchases(customerId),
      ]);
      setSummary({ regular, longTerm, grainCredit });
    } finally {
      setIsLoadingSummary(false);
    }
  }

  async function selectCustomer(customer: ExistingCustomer) {
    setSelected(customer);
    await loadSummary(customer.id);
  }

  function refreshSummary() {
    if (!selected) return;
    loadSummary(selected.id);
  }

  if (!selected) {
    return <CustomerSearch areas={areas} accountTypes={accountTypes} onSelect={selectCustomer} />;
  }

  const hasActivity =
    summary &&
    ((summary.regular && summary.regular.balance > 0) ||
      (summary.longTerm && summary.longTerm.balance > 0) ||
      summary.grainCredit.length > 0);

  return (
    <div>
      <CustomerHeader customer={selected} onBack={() => setSelected(null)} />

      {isLoadingSummary || !summary ? (
        <p style={{ color: "var(--ink-muted)" }}>Loading Udhaar summary…</p>
      ) : !hasActivity ? (
        <div className="panel">
          <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
            This customer doesn't owe the shop anything right now — nothing to clear.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {summary.regular && summary.regular.balance > 0 && (
            <DebtRowSection
              title="Regular / Daily Udhaar"
              subtitle="Owed to the shop — no fixed term."
              row={summary.regular}
              onRecorded={refreshSummary}
            />
          )}
          {summary.longTerm && summary.longTerm.balance > 0 && (
            <DebtRowSection
              title="Long-term Udhaar"
              subtitle="A deliberate cash loan with a chosen term."
              row={summary.longTerm}
              onRecorded={refreshSummary}
              lockBucket
            />
          )}
          {summary.grainCredit.length > 0 && (
            <GrainCreditSection customerName={selected.name} rows={summary.grainCredit} onRecorded={refreshSummary} />
          )}
        </div>
      )}
    </div>
  );
}

// "Shop Udhaar" tab's content, once a type has been picked — search a
// customer, then show just THAT type's section (Borrowed from
// customer = Udhaar to Shop; Stock/Grain Udhaar = Shop owes this
// customer for settled grain bought on Credit).
function ShopUdhaarPanel({
  areas,
  accountTypes,
  shopType,
  onBack,
}: {
  areas: Area[];
  accountTypes: AccountType[];
  shopType: "borrowed" | "grain";
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<ExistingCustomer | null>(null);
  const [grainOwed, setGrainOwed] = useState<GrainOwed | null>(null);
  const [shopBorrowed, setShopBorrowed] = useState<ShopBorrowedHistory | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  async function loadSummary(customerId: string) {
    setIsLoadingSummary(true);
    try {
      if (shopType === "grain") {
        setGrainOwed(await getShopOwedForGrainByProduct(customerId));
      } else {
        setShopBorrowed(await getCustomerShopBorrowedHistory(customerId));
      }
    } finally {
      setIsLoadingSummary(false);
    }
  }

  async function selectCustomer(customer: ExistingCustomer) {
    setSelected(customer);
    await loadSummary(customer.id);
  }

  function refreshSummary() {
    if (!selected) return;
    loadSummary(selected.id);
  }

  if (!selected) {
    return (
      <div>
        <button type="button" className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>
          <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Choose a different type
        </button>
        <h2 className="section-title">
          {shopType === "grain" ? "Stock/Grain Udhaar" : "Borrowed from customer"}
        </h2>
        <CustomerSearch areas={areas} accountTypes={accountTypes} onSelect={selectCustomer} />
      </div>
    );
  }

  const hasGrainActivity = grainOwed && Array.from(grainOwed.values()).some((v) => v.owed > 0.01);
  const hasBorrowedActivity = shopBorrowed && shopBorrowed.transactions.length > 0 && shopBorrowed.balance > 0;

  return (
    <div>
      <CustomerHeader customer={selected} onBack={() => setSelected(null)} />

      {isLoadingSummary || (shopType === "grain" ? !grainOwed : !shopBorrowed) ? (
        <p style={{ color: "var(--ink-muted)" }}>Loading…</p>
      ) : shopType === "grain" ? (
        !hasGrainActivity ? (
          <div className="panel">
            <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
              The shop doesn't owe this customer anything for grain right now.
            </p>
          </div>
        ) : (
          <GrainOwedSection
            customerId={selected.id}
            customerName={selected.name}
            grainOwed={grainOwed!}
            onRecorded={refreshSummary}
          />
        )
      ) : !hasBorrowedActivity ? (
        <div className="panel">
          <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
            The shop hasn't borrowed anything from this customer right now.
          </p>
        </div>
      ) : (
        <ShopBorrowedSection customerName={selected.name} history={shopBorrowed!} onRecorded={refreshSummary} />
      )}
    </div>
  );
}

// "Daily/Monthly Udhaar" — unpaid Credit expenses (rent, wages,
// supplier bills, ...). Unlike the other two Shop Udhaar types, this
// one has NO customer to search for — an expense isn't tied to any
// customer — so it skips straight to the list, same data/actions the
// Debts page's own "Daily/Monthly Udhaar" subtab already uses
// (listShopExpenseUdhaar/payExpenseDebt), just reachable from this
// one combined screen too.
function ExpenseUdhaarPanel({ onBack }: { onBack: () => void }) {
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
                <PayExpenseDebtModal expenseId={row.id} description={row.description} remaining={row.remaining} onDone={load} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Regular/Long-term Udhaar section — the customer owes the shop.
// Reuses RecordAccountTransactionModal, the exact same write path the
// Debts page's own "Record repayment" button uses, so a payment
// recorded here is indistinguishable from one recorded there.
function DebtRowSection({
  title,
  subtitle,
  row,
  onRecorded,
  lockBucket,
}: {
  title: string;
  subtitle: string;
  row: DebtRow;
  onRecorded: () => void;
  lockBucket?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 2px", fontSize: 15 }}>{title}</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink-muted)" }}>{subtitle}</p>
      <div className="stat-grid customers-stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <p className="stat-label">Borrowed</p>
          <p className="stat-value">{formatMoney(row.totalBorrowed)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Paid</p>
          <p className="stat-value tone-primary">{formatMoney(row.totalPaid)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Remaining</p>
          <p className="stat-value" style={{ color: "var(--consigned-600)" }}>
            {formatMoney(row.balance)}
          </p>
        </div>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink-muted)" }}>
        Udhaar since {formatDate(row.debtSince)} ({row.daysSince} day{row.daysSince === 1 ? "" : "s"} ago)
        {row.dueDate && <> · Due {formatDate(row.dueDate)}</>}
        {row.isOverdue && <span style={{ color: "var(--consigned-600)", fontWeight: 600 }}> · Overdue</span>}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Record payment
      </button>
      {open && (
        <RecordAccountTransactionModal
          customerAccountId={row.customerAccountId}
          defaultDirection="IN"
          lockBucket={lockBucket}
          onClose={() => {
            setOpen(false);
            onRecorded();
          }}
        />
      )}
    </section>
  );
}

// Shop owes THIS customer money for already-settled grain bought on
// Credit — the mirror direction from every other section here. One
// row per product (see getShopOwedForGrainByProduct), each with its
// own PayGrainDebtModal — same "pay per product, from that row"
// convention the Grain page's own per-product Shop Udhaar table uses.
function GrainOwedSection({
  customerId,
  customerName,
  grainOwed,
  onRecorded,
}: {
  customerId: string;
  customerName: string;
  grainOwed: GrainOwed;
  onRecorded: () => void;
}) {
  const rows = Array.from(grainOwed.entries()).filter(([, v]) => v.owed > 0.01);
  if (rows.length === 0) return null;

  const totalOwed = rows.reduce((sum, [, v]) => sum + v.owed, 0);

  return (
    <section className="panel" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 2px", fontSize: 15 }}>Shop owes this customer (Grain)</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink-muted)" }}>
        Money owed for grain already bought from them on Credit, not yet paid out.
      </p>
      <div className="stat-grid customers-stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <p className="stat-label">Total owed</p>
          <p className="stat-value" style={{ color: "var(--consigned-600)" }}>
            {formatMoney(totalOwed)}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(([productId, v]) => (
          <div
            key={productId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 0",
              borderTop: "0.5px solid var(--border)",
            }}
          >
            <span>
              {v.productName} — <strong>{formatMoney(v.owed)}</strong> owed
            </span>
            <PayGrainDebtModal
              customerId={customerId}
              productId={productId}
              customerName={customerName}
              amountOwed={v.owed}
              onDone={onRecorded}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// This customer owes the SHOP money for grain they bought at a
// settled rate on Credit — one row per grain sale item (see
// getCustomerGrainCreditPurchases), each individually payable via
// PayGrainSaleItemCreditModal, the same "Customer Udhaar" repayment
// path the Grain page's own subtab uses.
function GrainCreditSection({
  customerName,
  rows,
  onRecorded,
}: {
  customerName: string;
  rows: GrainCreditRows;
  onRecorded: () => void;
}) {
  const totalRemaining = rows.reduce((sum, r) => sum + r.remaining, 0);
  return (
    <section className="panel" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 2px", fontSize: 15 }}>Customer Udhaar (Grain)</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink-muted)" }}>
        Grain bought from the shop at a settled rate, paid via Credit.
      </p>
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
            key={row.dailySaleItemId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 0",
              borderTop: "0.5px solid var(--border)",
            }}
          >
            <span>
              {row.productName} ({row.quantity} {row.unitName}) — <strong>{formatMoney(row.remaining)}</strong>{" "}
              remaining
              {row.dueDate && (
                <span style={{ color: row.isOverdue ? "var(--consigned-600)" : "var(--ink-muted)", fontSize: 12.5 }}>
                  {" "}
                  · Due {formatDate(row.dueDate)}
                  {row.isOverdue ? " (overdue)" : ""}
                </span>
              )}
            </span>
            <PayGrainSaleItemCreditModal
              dailySaleItemId={row.dailySaleItemId}
              customerName={customerName}
              remaining={row.remaining}
              onDone={onRecorded}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// Cash the shop itself borrowed FROM this customer — the mirror of
// every other section here, where the shop is the debtor. Reuses
// ShopBorrowedHistoryPanel's own PayShopBorrowedLoanModal trigger.
function ShopBorrowedSection({
  customerName,
  history,
  onRecorded,
}: {
  customerName: string;
  history: ShopBorrowedHistory;
  onRecorded: () => void;
}) {
  if (!history.customerAccountId) return null;
  return (
    <section className="panel" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 2px", fontSize: 15 }}>Udhaar to Shop</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink-muted)" }}>
        Cash the shop itself borrowed from this customer.
      </p>
      <div className="stat-grid customers-stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <p className="stat-label">Given to shop</p>
          <p className="stat-value">{formatMoney(history.totalBorrowed)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Repaid</p>
          <p className="stat-value tone-primary">{formatMoney(history.totalPaid)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Shop still owes</p>
          <p className="stat-value" style={{ color: "var(--consigned-600)" }}>
            {formatMoney(history.balance)}
          </p>
        </div>
      </div>
      <PayShopBorrowedLoanModal
        customerAccountId={history.customerAccountId}
        customerName={customerName}
        balance={history.balance}
        onDone={onRecorded}
      />
    </section>
  );
}
