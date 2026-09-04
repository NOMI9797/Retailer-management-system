"use client";

import { useState } from "react";
import { formatMoney, describeBalance } from "@/lib/utils";
import type { getCustomer } from "@/modules/customers/actions";

type Account = Awaited<ReturnType<typeof getCustomer>>["accounts"][number];

// One expandable card per account — same "collapsed summary, expand
// for detail" pattern as GrainBatchList. "use client" only for the
// expand/collapse toggle; the balance/transaction data all arrives
// as a prop from the Server Component detail page.
export function CustomerAccountsList({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No accounts yet — accounts are added when creating the customer.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} />
      ))}
    </div>
  );
}

function AccountCard({ account }: { account: Account }) {
  const [expanded, setExpanded] = useState(false);
  const balance = describeBalance(account.currentBalance);
  // Coral always means the shop's money going out (same as "Shop
  // owes farmers" on the dashboard) — never the other way around, so
  // the color keeps one consistent meaning across every screen.
  // Negative balance = shop owes customer = coral; positive = teal.
  const balanceColor =
    account.currentBalance < 0
      ? "var(--consigned-600)"
      : account.currentBalance > 0
        ? "var(--primary-600)"
        : "var(--ink)";

  return (
    <div className={`grain-card${expanded ? " expanded" : ""}`}>
      <button className="grain-head" onClick={() => setExpanded((v) => !v)}>
        <div className="grain-head-left">
          <div className="grain-icon">
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z" />
            </svg>
          </div>
          <div>
            <p className="grain-name">{account.accountType.name}</p>
            <p className="grain-sub">
              {account.status === "ACTIVE" ? "Active" : "Closed"} · {account.transactions.length} transaction
              {account.transactions.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="grain-total">
          <p>{balance.label}</p>
          <p style={{ color: balanceColor }}>{formatMoney(balance.amount)}</p>
        </div>
      </button>

      {expanded && (
        <div className="batch-list">
          {account.transactions.length === 0 ? (
            <p style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>No transactions yet.</p>
          ) : (
            <>
              <div className="batch-row head">
                <span>Date</span>
                <span>Direction</span>
                <span>Amount</span>
                <span>Cash / account</span>
                <span>Notes</span>
              </div>
              {account.transactions.map((txn) => (
                <div className="batch-row" key={txn.id}>
                  <span>{new Date(txn.transactionDate).toLocaleDateString()}</span>
                  <span
                    className={`owner-tag ${txn.direction === "IN" ? "owner-shop" : "owner-customer"}`}
                  >
                    {txn.direction}
                  </span>
                  <span>{formatMoney(txn.amount)}</span>
                  <span>{txn.cashOrAccount}</span>
                  <span>{txn.notes || "—"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
