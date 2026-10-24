"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney, formatDate, matchesSearch } from "@/lib/utils";
import type { DealerRecordRow } from "../actions";

const PAY_CLASS = {
  cash: "pay-cash",
  account: "pay-account",
  credit: "pay-credit",
  mixed: "pay-mixed",
} as const;

// The Dealer page's Records, same layout as the Grain page's: two tabs —
// Credit (what the shop sold to dealers, money in) and Debit (what it
// bought from them, money out) — with a name search across dealer and
// product. Pure display: rows come from the tab's server fetch; the
// active tab and search are local UI state. Opens on Debit, since
// purchases are what this page is mostly used for.
export function DealerRecordsTabs({
  credit,
  debit,
  action,
}: {
  credit: DealerRecordRow[];
  debit: DealerRecordRow[];
  // Shown at the right of the search row (the tab's Record purchase).
  action?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"CREDIT" | "DEBIT">("DEBIT");
  const [search, setSearch] = useState("");
  const rows = (tab === "CREDIT" ? credit : debit).filter((r) =>
    matchesSearch(search, r.dealerName, r.productName),
  );
  const amountColor =
    tab === "CREDIT" ? "var(--primary-600)" : "var(--consigned-600)";

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        {" "}
        <div className="search-pill" style={{ minWidth: 260 }}>
          <svg className="icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search by dealer or product…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {action}
      </div>

      <section className="panel">
        <div
          className="grain-table-head"
          style={{ justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h3>Records</h3>
          </div>
          <div className="tabs" style={{ margin: 0, borderBottom: "none" }}>
            <button
              type="button"
              className={`tab${tab === "CREDIT" ? " active" : ""}`}
              onClick={() => setTab("CREDIT")}
            >
              Credit — sales ({credit.length})
            </button>
            <button
              type="button"
              className={`tab${tab === "DEBIT" ? " active" : ""}`}
              onClick={() => setTab("DEBIT")}
            >
              Debit — purchases ({debit.length})
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>{tab === "CREDIT" ? "Sold to" : "Bought from"}</th>
              <th>Product</th>
              <th style={{ textAlign: "right" }}>Quantity</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={7}>
                  {search
                    ? `No matches for "${search}".`
                    : tab === "CREDIT"
                      ? "Nothing sold to dealers yet."
                      : "No purchases recorded yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>
                    <Link
                      href={`/dashboard/dealers/${row.dealerId}`}
                      className="name-link"
                    >
                      {row.dealerName}
                    </Link>
                  </td>
                  <td>{row.productName}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {row.quantity} {row.unitName}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(row.rate)}
                  </td>
                  <td
                    className="num"
                    style={{
                      textAlign: "right",
                      fontWeight: 600,
                      color: amountColor,
                    }}
                  >
                    {formatMoney(row.amount)}
                  </td>
                  <td>
                    <span className={`pay-badge ${PAY_CLASS[row.paymentTone]}`}>
                      {row.payment}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
