"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLedgerReceipt,
  getCustomerLedgerReceipt,
  type LedgerReceipt,
  type LedgerReceiptBalance,
} from "../actions";
import { PrintLedgerReceiptButton } from "./PrintLedgerReceiptButton";
import { receiptDetailLines, receiptLabel, receiptPayment } from "../labels";
import { showToast } from "@/components/shared/toastStore";
import {
  formatMoney,
  formatDate,
  formatTime,
  toLocalDateString,
} from "@/lib/utils";

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalDateString(d);
}

// Pick From / To dates, Show the customer's ledger receipt for them,
// then Create receipt (saved under Receipts → Ledger receipts, opened
// there as it would print) or Print it on the receipt printer. The receipt is only loaded when
// Show is pressed — it's a report asked for on demand, not page data.
export function LedgerReceiptPanel({
  customer,
}: {
  customer: { id: string; name: string };
}) {
  const [fromDate, setFromDate] = useState(daysAgo(6));
  const [toDate, setToDate] = useState(toLocalDateString(new Date()));
  const [receipt, setReceipt] = useState<LedgerReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  async function handleShow(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const result = await getCustomerLedgerReceipt({
      customerId: customer.id,
      fromDate,
      toDate,
    });
    setIsLoading(false);
    if (result.success) setReceipt(result.data);
    else {
      setReceipt(null);
      setError(result.error);
    }
  }

  async function handleCreate() {
    setIsCreating(true);
    setError(null);
    const result = await createLedgerReceipt({
      customerId: customer.id,
      fromDate,
      toDate,
    });
    if (!result.success) {
      setIsCreating(false);
      setError(result.error);
      return;
    }
    showToast(`Ledger receipt L-${result.data.receiptNumber} created`);
    router.push(`/dashboard/receipts/ledger/${result.data.id}`);
  }

  // Changing a date hides the old receipt so what's shown always
  // matches the dates picked.
  function changeDate(set: (v: string) => void, value: string) {
    set(value);
    setReceipt(null);
  }

  return (
    <div>
      <form
        onSubmit={handleShow}
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div className="field" style={{ margin: 0 }}>
          <label>From</label>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => changeDate(setFromDate, e.target.value)}
            required
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>To</label>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => changeDate(setToDate, e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? "Loading…" : "Show"}
        </button>
        {receipt && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? "Creating…" : "Create receipt"}
            </button>
            <PrintLedgerReceiptButton receipt={receipt} />
          </>
        )}
      </form>
      {error && (
        <p
          style={{ marginTop: 10, fontSize: 13, color: "var(--consigned-600)" }}
        >
          {error}
        </p>
      )}

      {receipt && <ReceiptView receipt={receipt} />}
    </div>
  );
}

function ReceiptView({ receipt }: { receipt: LedgerReceipt }) {
  const net = receipt.closing.customerOwes - receipt.closing.shopOwes;
  return (
    <div style={{ marginTop: 20 }}>
      <p
        style={{
          fontSize: 13.5,
          color: "var(--ink-muted)",
          margin: "0 0 12px",
        }}
      >
        <strong style={{ color: "var(--ink)" }}>{receipt.customer.name}</strong>{" "}
        · {formatDate(receipt.fromDate)} to {formatDate(receipt.toDate)} ·{" "}
        {receipt.entries.length}{" "}
        {receipt.entries.length === 1 ? "entry" : "entries"}
      </p>

      <BalanceRow title="Opening balance" balance={receipt.opening} />

      <div className="panel" style={{ margin: "12px 0" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {receipt.entries.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={4}>No entries between these dates.</td>
              </tr>
            ) : (
              receipt.entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {formatDate(entry.date)}
                    <span
                      style={{
                        display: "block",
                        fontSize: 12,
                        color: "var(--ink-muted)",
                      }}
                    >
                      {formatTime(entry.date)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{receiptLabel(entry.label)}</span>
                    {entry.items.map((item, i) => (
                      <span
                        key={i}
                        style={{
                          display: "block",
                          fontSize: 12.5,
                          color: "var(--ink-muted)",
                        }}
                      >
                        {item.productName}: {item.quantity} {item.unitName} ×{" "}
                        {formatMoney(item.price)}
                      </span>
                    ))}
                    {receiptDetailLines(entry.detail).map((detail, i) => (
                      <span
                        key={i}
                        style={{
                          display: "block",
                          fontSize: 12.5,
                          color: "var(--ink-muted)",
                        }}
                      >
                        {detail}
                      </span>
                    ))}
                  </td>
                  <td
                    className="num"
                    style={{
                      textAlign: "right",
                      fontWeight: 600,
                      color:
                        entry.side === "CREDIT"
                          ? "var(--primary-600)"
                          : "var(--consigned-600)",
                    }}
                  >
                    {entry.stockOnly ? (
                      <span className="dash">—</span>
                    ) : (
                      formatMoney(entry.amount)
                    )}
                  </td>
                  <td>
                    {entry.stockOnly ? (
                      <span
                        className="pay-badge pay-mixed"
                        style={{ color: "var(--grain-600)" }}
                      >
                        Grain
                      </span>
                    ) : (
                      <span style={{ fontSize: 12.5 }}>
                        {receiptPayment(entry) ?? "Udhaar entry"}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <BalanceRow title="Closing balance" balance={receipt.closing} />
      <p style={{ margin: "12px 0 0", fontWeight: 600 }}>
        {Math.abs(net) < 0.01
          ? "Net: all settled"
          : net > 0
            ? `Net: customer owes the shop ${formatMoney(net)}`
            : `Net: the shop owes the customer ${formatMoney(-net)}`}
      </p>
    </div>
  );
}

function BalanceRow({
  title,
  balance,
}: {
  title: string;
  balance: LedgerReceiptBalance;
}) {
  return (
    <>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          margin: "0 0 8px",
          color: "var(--ink-muted)",
        }}
      >
        {title}
      </h3>
      <div className="stat-grid" style={{ margin: 0 }}>
        <div className="stat-card">
          <p className="stat-label">Customer owes shop</p>
          <p className="stat-value tone-primary">
            {formatMoney(balance.customerOwes)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Shop owes customer</p>
          <p className="stat-value tone-consigned">
            {formatMoney(balance.shopOwes)}
          </p>
        </div>
        {balance.grainLoans.length > 0 && (
          <div className="stat-card">
            <p className="stat-label">Grain loans</p>
            <p className="stat-value tone-grain" style={{ fontSize: 15 }}>
              {balance.grainLoans.map((g) => (
                <span key={g.productName} style={{ display: "block" }}>
                  {g.lent > 0 &&
                    `Owes shop: ${g.lent} ${g.unitName} ${g.productName}`}
                  {g.lent > 0 && g.borrowed > 0 && " · "}
                  {g.borrowed > 0 &&
                    `Shop owes: ${g.borrowed} ${g.unitName} ${g.productName}`}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
