"use client";

import { useState } from "react";
import { formatMoney, describeBalance, formatDate } from "@/lib/utils";
import { RecordAccountTransactionModal } from "@/modules/customers/components/RecordAccountTransactionModal";
import type { getCustomer } from "@/modules/customers/actions";

type Account = Awaited<ReturnType<typeof getCustomer>>["accounts"][number];

// A dedicated Accounts panel — one row per account type with its own
// colored icon (teal for Regular, neutral for Udhaar-style, coral for
// Consignment), rather than the generic grain-card/batch-row pattern
// borrowed from Products, since an account's shape (a balance plus a
// flat transaction ledger) doesn't need a grain batch's structure.
// "use client" only for the expand/collapse toggle; the balance/
// transaction data all arrives as a prop from the Server Component
// detail page.
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
    <div className="accounts-panel">
      {accounts.map((account) => (
        <AccountRow key={account.id} account={account} />
      ))}
    </div>
  );
}

// Consignment is the one account kind with a real behavioral
// difference (tracksQuantity — farmer payouts), so it's keyed off that
// flag rather than a specific code, which may not exist for every
// shop. "Udhaar" has no such flag to key off, so any other non-tracking
// account type (Udhaar, or a shopkeeper's own custom type) falls back
// to the same neutral icon rather than guessing from its name.
function iconVariant(account: Account) {
  if (account.accountType.tracksQuantity) return "consignment";
  if (account.accountType.code === "REGULAR") return "regular";
  return "udhar";
}

function AccountIcon({ variant }: { variant: string }) {
  if (variant === "consignment") {
    return (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M12 2v20M8 6l4-4 4 4M8 12l4-4 4 4M8 18l4-4 4 4" />
      </svg>
    );
  }
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z" />
    </svg>
  );
}

function AccountRow({ account }: { account: Account }) {
  const [expanded, setExpanded] = useState(false);
  const balance = describeBalance(account.currentBalance);
  const isSettled = account.currentBalance === 0;
  // Coral always means the shop's money going out (same as "Shop
  // owes farmers" on the dashboard) — never the other way around, so
  // the color keeps one consistent meaning across every screen.
  // Negative balance = shop owes customer = coral; positive = teal.
  const balanceColor = isSettled
    ? "var(--ink-muted)"
    : account.currentBalance < 0
      ? "var(--consigned-600)"
      : "var(--primary-600)";
  const variant = iconVariant(account);

  return (
    <div>
      <button
        className="acct-row"
        style={{ width: "100%", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="acct-left">
          <div className={`acct-icon ${variant}`}>
            <AccountIcon variant={variant} />
          </div>
          <div>
            <p className="acct-name">{account.accountType.name}</p>
            <p className="acct-meta">
              {account.status === "ACTIVE" ? "Active" : "Closed"} · {account.transactions.length} transaction
              {account.transactions.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="acct-right">
          <p className="acct-status">{balance.label}</p>
          <p className={`acct-balance num${isSettled ? " settled" : ""}`} style={{ color: balanceColor }}>
            {formatMoney(balance.amount)}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="batch-list">
          {!account.accountType.tracksQuantity && (
            <div style={{ marginBottom: 12 }}>
              <RecordAccountTransactionModal customerAccountId={account.id} />
            </div>
          )}
          {account.transactions.length === 0 ? (
            <p style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>No transactions yet.</p>
          ) : (
            <>
              <div className="batch-row head">
                <span>Date</span>
                <span>Direction</span>
                <span>Amount</span>
                <span>Method</span>
                <span>Notes</span>
              </div>
              {account.transactions.map((txn) => (
                <div className="batch-row" key={txn.id}>
                  <span>{formatDate(txn.transactionDate)}</span>
                  <span
                    className={`owner-tag ${txn.direction === "IN" ? "owner-shop" : "owner-customer"}`}
                  >
                    {txn.direction}
                  </span>
                  <span>{formatMoney(txn.amount)}</span>
                  <span>{txn.paymentMethod}</span>
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
