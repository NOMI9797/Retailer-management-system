"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatMoney, formatDate, matchesSearch } from "@/lib/utils";
import { BuyFromCustomerModal } from "@/modules/stock/components/BuyFromCustomerModal";
import { GiveBackGrainModal } from "@/modules/stock/components/GiveBackGrainModal";
import { GrainLoanRecords } from "@/modules/grain-loans/components/GrainLoanRecords";
import type { GrainLoanRow } from "@/modules/grain-loans/actions";
import { HomeGrainRecords } from "@/modules/stock/components/HomeGrainRecords";
import type { HomeGrainRow } from "@/modules/stock/homeGrain.actions";
import type { listAreas } from "@/modules/settings/areas.actions";
import type {
  listGrainLedger,
  listCustomerBatchesForProduct,
} from "@/modules/stock/actions";

type Ledger = Awaited<ReturnType<typeof listGrainLedger>>;
type CustomerBatch = Awaited<
  ReturnType<typeof listCustomerBatchesForProduct>
>[number];

// What the Loans tab's edit / return forms need.
export type LoanOptions = {
  areas: Awaited<ReturnType<typeof listAreas>>;
  dealers: { id: string; name: string }[];
  bankAccounts: { id: string; name: string }[];
};

const PAY_CLASS = {
  cash: "pay-cash",
  account: "pay-account",
  credit: "pay-credit",
  mixed: "pay-mixed",
} as const;

// One grain product's records, as tabs: Credit (the shop selling
// it — money in — and own stock added), Debit (the shop buying it — money out), each row
// tagged Customer or Dealer; and Rate (not settled) — customer deposits
// with grain the shop hasn't agreed a rate for yet, each with Buy from
// customer or Give back (returned as it is, no money). Pure display; the data comes from the Grain page's server
// fetch — the tab is just local UI state.
export function GrainLedgerTabs({
  ledger,
  customerBatches,
  unitName,
  productName,
  loans,
  loanOptions,
  homeGrain = [],
}: {
  ledger: Ledger;
  customerBatches: CustomerBatch[];
  unitName: string;
  productName: string;
  loans: GrainLoanRow[];
  loanOptions: LoanOptions;
  // Bought but (some still) at the seller's home.
  homeGrain?: HomeGrainRow[];
}) {
  const [tab, setTab] = useState<"CREDIT" | "DEBIT" | "UNSETTLED" | "LOANS" | "HOMES">("CREDIT");
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
            Credit — sales & stock added ({ledger.credit.length})
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
          <button
            type="button"
            className={`tab${tab === "LOANS" ? " active" : ""}`}
            onClick={() => setTab("LOANS")}
          >
            Loans ({loans.filter((l) => l.outstanding > 0).length})
          </button>
          <button
            type="button"
            className={`tab${tab === "HOMES" ? " active" : ""}`}
            onClick={() => setTab("HOMES")}
          >
            At customers&apos; homes ({homeGrain.filter((h) => h.remaining > 0).length})
          </button>
        </div>
      </div>

      {tab === "HOMES" ? (
        <HomeGrainRecords
          rows={homeGrain.filter((h) => matchesSearch(search, h.customer.name))}
          bankAccounts={loanOptions.bankAccounts}
          emptyText={
            search
              ? `No matches for "${search}".`
              : "No grain of this kind bought that's still at a customer's home. Record one from Add batch → Customer → Bought — still at their home."
          }
        />
      ) : tab === "LOANS" ? (
        <GrainLoanRecords
          loans={loans.filter((l) => matchesSearch(search, l.party.name))}
          areas={loanOptions.areas}
          dealers={loanOptions.dealers}
          bankAccounts={loanOptions.bankAccounts}
          emptyText={search ? `No matches for "${search}".` : "No grain loans of this grain yet."}
        />
      ) : tab === "UNSETTLED" ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th style={{ textAlign: "right" }}>Deposited</th>
                <th style={{ textAlign: "right" }}>Bought by shop</th>
                <th style={{ textAlign: "right" }}>Given back</th>
                <th style={{ textAlign: "right" }}>Rate not settled</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unsettled.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={8}>
                    {search
                      ? `No matches for "${search}".`
                      : "Every customer deposit of this grain has a settled rate."}
                  </td>
                </tr>
              ) : (
                unsettled.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      {formatDate(batch.receivedAt)}
                      {batch.reference && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
                          Ref: {batch.reference}
                        </span>
                      )}
                    </td>
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
                    <td className="num" style={{ textAlign: "right" }}>
                      {batch.returnedQuantity > 0 ? (
                        `${batch.returnedQuantity} ${unitName}`
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
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                        <BuyFromCustomerModal
                          grainBatchId={batch.id}
                          customerName={batch.customerName}
                          remainingClaim={batch.unsettledQuantity}
                          unitName={unitName}
                        />
                        <GiveBackGrainModal
                          grainBatchId={batch.id}
                          customerName={batch.customerName}
                          productName={productName}
                          unsettledQuantity={batch.unsettledQuantity}
                          unitName={unitName}
                        />
                      </div>
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
                <th>{tab === "CREDIT" ? "Sold to / added" : "Bought from"}</th>
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
                        className={`pay-badge ${row.party === "DEALER" ? "pay-account" : row.party === "SHOP" ? "pay-cash" : "pay-mixed"}`}
                      >
                        {row.party === "DEALER" ? "Dealer" : row.party === "SHOP" ? "Shop" : "Customer"}
                      </span>
                      {row.reference && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
                          Ref: {row.reference}
                        </span>
                      )}
                      {row.fromHomeOf && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
                          From{" "}
                          <Link href={row.fromHomeOf.href} className="name-link">
                            {row.fromHomeOf.name}
                          </Link>
                          &apos;s home
                        </span>
                      )}
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
                      {row.party === "SHOP" ? "+ " : ""}
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
