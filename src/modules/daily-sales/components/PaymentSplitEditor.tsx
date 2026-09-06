"use client";

import { useEffect, useState } from "react";

export type PaymentSplitDraft = {
  cash: string;
  account: string;
  credit: string;
};

const EPSILON = 0.01;
const ZERO_SPLIT: PaymentSplitDraft = { cash: "", account: "", credit: "" };

function singleMethodSplit(method: keyof PaymentSplitDraft, total: number): PaymentSplitDraft {
  return { ...ZERO_SPLIT, [method]: total > 0 ? String(total) : "" };
}

// Two ways to pay, per the shopkeeper's actual counter workflow: most
// sales are 100% one method, so a single tap ("All cash" / "All
// account" / "All credit") fills the whole bill total into that
// method with zero typing. "Custom split" is the fallback for the
// minority of sales that genuinely mix methods (e.g. some cash, some
// on account, some credit), which reveals the three manual amount
// fields. Cash and Account both mean "paid in full right now," just
// different channels (tracked separately for Milestone 3's Cash Flow
// reconciliation); Credit is the only one that creates an outstanding
// balance on the customer's account. Whichever mode is used, the
// three amounts must add up to the bill total exactly before submit.
export function PaymentSplitEditor({
  total,
  payments,
  onChange,
}: {
  total: number;
  payments: PaymentSplitDraft;
  onChange: (payments: PaymentSplitDraft) => void;
}) {
  const cash = Number(payments.cash) || 0;
  const account = Number(payments.account) || 0;
  const credit = Number(payments.credit) || 0;
  const splitTotal = cash + account + credit;
  const remaining = total - splitTotal;
  const isBalanced = Math.abs(remaining) <= EPSILON;

  // A quick-tick method is "selected" if the whole current split is
  // just that one method matching the current total — lets the
  // active tick stay highlighted even as the total changes with the
  // line items, without tracking separate UI-only state that could
  // drift from the actual payments prop.
  const activeQuickMethod = (["cash", "account", "credit"] as const).find(
    (m) => Math.abs((Number(payments[m]) || 0) - total) <= EPSILON && (["cash", "account", "credit"] as const).every((other) => other === m || !(Number(payments[other]) || 0))
  );

  const [customMode, setCustomMode] = useState(!activeQuickMethod && splitTotal > 0);

  // Re-fill whichever quick method is active when the bill total
  // changes (e.g. shopkeeper adds another line item after already
  // ticking "All cash") so the tick stays correct instead of going
  // stale at the old total.
  useEffect(() => {
    if (!customMode && activeQuickMethod) {
      onChange(singleMethodSplit(activeQuickMethod, total));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  function selectQuickMethod(method: keyof PaymentSplitDraft) {
    setCustomMode(false);
    onChange(singleMethodSplit(method, total));
  }

  function switchToCustom() {
    setCustomMode(true);
  }

  function fillRemaining(field: keyof PaymentSplitDraft) {
    const others = (["cash", "account", "credit"] as const).filter((f) => f !== field);
    const othersSum = others.reduce((sum, f) => sum + (Number(payments[f]) || 0), 0);
    const value = Math.max(0, total - othersSum);
    onChange({ ...payments, [field]: value ? String(value) : "" });
  }

  return (
    <div className="field">
      <label>Payment split</label>

      <div className="stock-toggle" style={{ marginBottom: 8 }}>
        <button type="button" className={!customMode && activeQuickMethod === "cash" ? "active" : ""} onClick={() => selectQuickMethod("cash")}>
          All cash
        </button>
        <button type="button" className={!customMode && activeQuickMethod === "account" ? "active" : ""} onClick={() => selectQuickMethod("account")}>
          All account
        </button>
        <button type="button" className={!customMode && activeQuickMethod === "credit" ? "active" : ""} onClick={() => selectQuickMethod("credit")}>
          All credit
        </button>
        <button type="button" className={customMode ? "active" : ""} onClick={switchToCustom}>
          Custom split
        </button>
      </div>

      {customMode && (
        <div className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, flex: "0 1 200px" }}>
            <label style={{ fontWeight: 400, fontSize: 12.5 }}>Cash</label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={payments.cash}
              onChange={(e) => onChange({ ...payments, cash: e.target.value })}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: "0 1 200px" }}>
            <label style={{ fontWeight: 400, fontSize: 12.5 }}>Account</label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={payments.account}
              onChange={(e) => onChange({ ...payments, account: e.target.value })}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: "0 1 200px" }}>
            <label style={{ fontWeight: 400, fontSize: 12.5 }}>Credit</label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={payments.credit}
              onChange={(e) => onChange({ ...payments, credit: e.target.value })}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginBottom: 0 }}
            onClick={() => fillRemaining(credit === 0 && cash === 0 && account === 0 ? "cash" : "credit")}
          >
            Fill remaining
          </button>
        </div>
      )}

      <p style={{ fontSize: 13, marginTop: 6, color: isBalanced ? "var(--ink-muted)" : "var(--consigned-600)" }}>
        Bill total: Rs {total.toFixed(2)} · Split: Rs {splitTotal.toFixed(2)}
        {!isBalanced && (remaining > 0 ? ` · Rs ${remaining.toFixed(2)} left to assign` : ` · Rs ${Math.abs(remaining).toFixed(2)} over the total`)}
      </p>
    </div>
  );
}
