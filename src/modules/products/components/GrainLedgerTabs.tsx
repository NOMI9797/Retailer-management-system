"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatMoney, formatDate, matchesSearch } from "@/lib/utils";
import { BuyFromCustomerModal } from "@/modules/stock/components/BuyFromCustomerModal";
import type {
  listGrainLedger,
  listCustomerBatchesForProduct,
} from "@/modules/stock/actions";

type Ledger = Awaited<ReturnType<typeof listGrainLedger>>;
type CustomerBatch = Awaited<
  ReturnType<typeof listCustomerBatchesForProduct>
>[number];

const PAY_CLASS = {
  cash: "pay-cash",
  account: "pay-account",
  credit: "pay-credit",
  mixed: "pay-mixed",
} as const;

// One grain product's records, as three tabs: Credit (the shop selling
// it — money in), Debit (the shop buying it — money out), each row
// tagged Customer or Dealer; and Rate (not settled) — customer deposits
// with grain the shop hasn't agreed a rate for yet, each with Buy from
// customer. Pure display; the data comes from the Grain page's server
// fetch — the tab is just local UI state.
export function GrainLedgerTabs({
  ledger,
  customerBatches,
  unitName,
}: {
  ledger: Ledger;
  customerBatches: CustomerBatch[];
  unitName: string;
}) {
  const [tab, setTab] = useState<"CREDIT" | "DEBIT" | "UNSETTLED">("CREDIT");
  // Name search across whichever tab is open (customer or dealer) —
  // typed into GrainNameSearch above the tabs, shared via ?name=.
  const search = useSearchParams().get("name") ?? "";
  const unsettled = customerBatches.filter(
    (b) => b.unsettledQuantity > 0 && matchesSearch(search, b.customerName),
  );
  const rows = (tab === "CREDIT" ? ledger.credit : ledger.debit).filter((r) =>
    matchesSearch(search, r.partyName),
  );

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <div
        className="grain-table-head"
        style={{ justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <h3>Records</h3>
        <div className="tabs" style={{ margin: 0, borderBottom: "none" }}>
          <button
            type="button"
            className={`tab${tab === "CREDIT" ? " active" : ""}`}
            onClick={() => setTab("CREDIT")}
          >
            Credit — sales ({ledger.credit.length})
          </button>
          <button
            type="button"
            className={`tab${tab === "DEBIT" ? " active" : ""}`}
            onClick={() => setTab("DEBIT")}
          >
            Debit — purchases ({ledger.debit.length})
          </button>
          <button
            type="button"
            className={`tab${tab === "UNSETTLED" ? " active" : ""}`}
            onClick={() => setTab("UNSETTLED")}
          >
            Rate (not settled) (
            {customerBatches.filter((b) => b.unsettledQuantity > 0).length})
          </button>
        </div>
      </div>

      {tab === "UNSETTLED" ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th style={{ textAlign: "right" }}>Deposited</th>
                <th style={{ textAlign: "right" }}>Bought by shop</th>
                <th style={{ textAlign: "right" }}>Rate not settled</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unsettled.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={7}>
                    {search
                      ? `No matches for "${search}".`
                      : "Every customer deposit of this grain has a settled rate."}
                  </td>
                </tr>
              ) : (
                unsettled.map((batch) => (
                  <tr key={batch.id}>
                    <td>{formatDate(batch.receivedAt)}</td>
                    <td>
                      <div className="cust-cell">
                        <div className="cust-avatar">
                          {batch.customerName.charAt(0).toUpperCase()}
                        </div>
                        <Link
                          href={`/dashboard/customers/${batch.customerId}?tab=grain`}
                          className="name-link"
                        >
                          {batch.customerName}
                        </Link>
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {batch.quantityIn} {unitName}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {batch.settledQuantity > 0 ? (
                        `${batch.settledQuantity} ${unitName}`
                      ) : (
                        <span className="dash">—</span>
                      )}
                    </td>
                    <td
                      className="num"
                      style={{
                        textAlign: "right",
                        color: "var(--grain-600)",
                        fontWeight: 600,
                      }}
                    >
                      {batch.unsettledQuantity} {unitName}
                    </td>
                    <td
                      className="num"
                      style={{ textAlign: "right", fontWeight: 600 }}
                    >
                      {batch.settledTotalAmount > 0 ? (
                        formatMoney(batch.settledTotalAmount)
                      ) : (
                        <span className="dash">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <BuyFromCustomerModal
                        grainBatchId={batch.id}
                        customerName={batch.customerName}
                        remainingClaim={batch.unsettledQuantity}
                        unitName={unitName}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>{tab === "CREDIT" ? "Sold to" : "Bought from"}</th>
                <th style={{ textAlign: "right" }}>Quantity</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={6}>
                    {search
                      ? `No matches for "${search}".`
                      : tab === "CREDIT"
                        ? "No sales of this grain yet."
                        : "No purchases of this grain yet."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.date)}</td>
                    <td>
                      <Link
                        href={row.partyHref}
                        className="name-link"
                        style={{ marginRight: 8 }}
                      >
                        {row.partyName}
                      </Link>
                      <span
                        className={`pay-badge ${row.party === "DEALER" ? "pay-account" : "pay-mixed"}`}
                      >
                        {row.party === "DEALER" ? "Dealer" : "Customer"}
                      </span>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {row.quantity} {unitName}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatMoney(row.rate)}
                    </td>
                    <td
                      className="num"
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color:
                          tab === "CREDIT"
                            ? "var(--primary-600)"
                            : "var(--consigned-600)",
                      }}
                    >
                      {formatMoney(row.amount)}
                    </td>
                    <td>
                      <span
                        className={`pay-badge ${PAY_CLASS[row.paymentTone]}`}
                      >
                        {row.payment}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
