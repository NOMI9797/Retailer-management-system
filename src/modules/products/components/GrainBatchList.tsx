import { Fragment } from "react";
import Link from "next/link";
import type { listCustomerBatchesForProduct, getStockOverview } from "@/modules/stock/actions";
import { StockSummary } from "./StockSummary";
import { AddBatchModal } from "./AddBatchModal";
import { BuyFromCustomerModal } from "@/modules/stock/components/BuyFromCustomerModal";
import { formatMoney, formatDate } from "@/lib/utils";
import type { listAreas } from "@/modules/settings/areas.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];

type GrainProduct = {
  id: string;
  name: string;
  category: { name: string };
  unit: { name: string };
};

type CustomerBatch = Awaited<ReturnType<typeof listCustomerBatchesForProduct>>[number];
type Overview = Awaited<ReturnType<typeof getStockOverview>>;

// One selected grain product's stock — an "Add batch" action row
// (same page-head shape every other screen's "Add X" button uses),
// the Own/Customer/Total/Udhaar stat cards, and a real <table> of
// customer deposits below, matching the app's standard table pattern
// (see DebtorTable.tsx/CustomerTable.tsx) rather than the old
// CSS-grid "batch-row" divs. No collapsible-card chrome here — the
// Grain page's product sub-tabs already show exactly one product at a
// time (see GrainStockList.tsx). Only CUSTOMER-owned batches get a
// row; a shop-owned batch (whether added directly, or created by a
// transfer-purchase/settle-now deposit) never gets its own line —
// its quantity is already counted in the "Own stock" card, per the
// "don't show Shop-owned for each individual batch" decision. Adding
// a batch or recording a transfer-purchase (both now modals — see
// AddBatchModal/BuyFromCustomerModal) calls its Server Action then
// router.refresh() to re-run the server fetch — no client-side data
// fetching in this component at all, which is why it's a plain
// Server Component now (the interactive pieces live in those modals).
export function GrainBatchList({
  product,
  batchCount,
  customerBatches,
  overview,
  areas,
  bankAccounts = [],
}: {
  product: GrainProduct;
  batchCount: number;
  customerBatches: CustomerBatch[];
  overview: Overview;
  areas: Area[];
  bankAccounts?: { id: string; name: string }[];
}) {
  // Date-header rows grouped by deposit date (receivedAt) — same
  // "insert a header row whenever the date changes" pattern
  // SalesHistoryTable uses, since customerBatches already arrives
  // sorted newest-first (see listCustomerBatchesForProduct). A
  // batch's settlements can span several LATER dates, which this
  // grouping deliberately doesn't try to split apart — it groups by
  // when the deposit itself was made.
  let lastDateKey: string | null = null;

  return (
    <>
      <div className="page-head" style={{ marginBottom: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--primary-600)" }}>{product.name}</h2>
        <AddBatchModal productId={product.id} areas={areas} bankAccounts={bankAccounts} />
      </div>

      <StockSummary
        totalRemaining={overview.totalPhysical}
        unitName={product.unit.name}
        ownAvailable={overview.ownAvailable}
        customerClaim={overview.customerClaim}
        stockUdhaarOutstanding={overview.stockUdhaarOutstanding}
      />

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th style={{ textAlign: "right" }}>Deposited</th>
              <th style={{ textAlign: "right" }}>Remaining</th>
              <th>Rate settled (qty)</th>
              <th style={{ textAlign: "right" }}>Total amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customerBatches.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={6}>No customer deposits for this product.</td>
              </tr>
            ) : (
              customerBatches.map((batch) => {
                const dateKey = formatDate(batch.receivedAt);
                const isNewDay = dateKey !== lastDateKey;
                lastDateKey = dateKey;

                return (
                  <Fragment key={batch.id}>
                    {isNewDay && (
                      <tr className="table-date-header">
                        <td colSpan={6}>{dateKey}</td>
                      </tr>
                    )}
                    <tr>
                      <td>
                        <div className="cust-cell">
                          <div className="cust-avatar">{batch.customerName.charAt(0).toUpperCase()}</div>
                          <span style={{ fontWeight: 500 }}>{batch.customerName}</span>
                        </div>
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {batch.quantityIn} {product.unit.name}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {batch.unsettledQuantity} {product.unit.name}
                      </td>
                      <td className="num">
                        {batch.settlements.length === 0 ? "—" : `${batch.settledQuantity} ${product.unit.name}`}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {batch.settledTotalAmount > 0 ? formatMoney(batch.settledTotalAmount) : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {batch.unsettledQuantity > 0 && (
                            <BuyFromCustomerModal
                              grainBatchId={batch.id}
                              customerName={batch.customerName}
                              remainingClaim={batch.unsettledQuantity}
                              unitName={product.unit.name}
                            />
                          )}
                          <Link href={`/dashboard/customers/${batch.customerId}?tab=grain`} className="btn btn-ghost">
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
