"use client";

import { useState } from "react";
import type { getCustomerGrainDeposits } from "../actions";
import type { getCustomerGrainCreditPurchases } from "@/modules/daily-sales/actions";
import { BuyFromCustomerModal } from "./BuyFromCustomerModal";
import { GiveBackGrainModal } from "./GiveBackGrainModal";
import { EditGrainSettlementModal } from "./EditGrainSettlementModal";
import { DeleteGrainSettlementButton } from "./DeleteGrainSettlementButton";
import { EditGrainDepositModal } from "./EditGrainDepositModal";
import { DeleteGrainDepositButton } from "./DeleteGrainDepositButton";
import { SaleVisitActions } from "@/modules/daily-sales/components/SaleVisitActions";
import {
  CustomerUdhaarPaymentModal,
  ShopUdhaarPaymentModal,
} from "@/modules/customers/components/CustomerUdhaarPayment";
import { formatMoney, formatDate } from "@/lib/utils";
import type { listProducts } from "@/modules/products/actions";

type Deposits = Awaited<ReturnType<typeof getCustomerGrainDeposits>>;
type CreditPurchases = Awaited<ReturnType<typeof getCustomerGrainCreditPurchases>>;
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

// One row's worth of detail — a real settlement (a specific purchase
// the SHOP made from this customer, with its own date/quantity/rate/
// amount/paid-or-Udhaar status), the still-unsettled remainder of a
// deposit (no rate/amount yet), or a credit-purchase (the mirror
// direction — this customer buying grain FROM the shop on Credit,
// still owing). Flattened out of every batch's settlements array plus
// the customer's own Credit purchases so each event gets its OWN row,
// merged into one chronological list rather than two separate subtabs
// — "Deposits" now covers every grain event involving this customer,
// whichever direction the money/stock moved.
type Row =
  | {
      // Unsettled grain given back to the customer as it is (no money).
      kind: "returned";
      key: string;
      id: string;
      batchId: string;
      // The deposit's unsettled grain now — with this give-back's own
      // quantity, the most an edit can raise it to.
      batchUnsettled: number;
      notes: string | null;
      date: Date;
      productId: string;
      productName: string;
      unitName: string;
      quantity: number;
      reference: string;
    }
  | {
      kind: "settlement";
      key: string;
      // The AccountTransaction id this settlement posted as — needed
      // for edit/delete (updateGrainSettlement/deleteGrainSettlement),
      // distinct from the batch's own id above. Null in the rare case
      // a settlement's payment row somehow doesn't exist (see
      // SettlementEntry's own comment) — edit/delete are hidden then.
      transactionId: string | null;
      date: Date;
      productId: string;
      productName: string;
      unitName: string;
      quantity: number;
      rate: number;
      amount: number;
      paymentMethod: "CASH" | "ACCOUNT" | "CREDIT" | null;
    }
  | {
      kind: "unsettled";
      key: string;
      // The batch's own id — needed for the optional "Buy from
      // customer" action (see onSettle below) AND for edit/delete
      // (updateGrainBatch/deleteGrainBatch); the deposit-batch rows
      // elsewhere in the app key off this same id.
      batchId: string;
      date: Date;
      productId: string;
      productName: string;
      unitName: string;
      quantity: number;
      reference: string | null;
      // Whether any of this batch has already been drawn via Stock
      // Udhaar (sold before being purchased from the customer) —
      // updateGrainBatch/deleteGrainBatch both refuse once this is
      // true (see their own comments), so Edit/Delete are hidden here
      // rather than shown and then bouncing off a confusing error.
      hasBeenSold: boolean;
    }
  | {
      kind: "credit-purchase";
      key: string;
      dailySaleItemId: string;
      // The parent sale — a credit-purchase row's edit/delete goes
      // through the same sale edit/delete every other sale uses (see
      // SaleVisitActions), since a DailySaleItem can't
      // be reversed independently of the DailySale it belongs to.
      dailySaleId: string;
      date: Date;
      productId: string;
      productName: string;
      unitName: string;
      quantity: number;
      rate: number;
      remaining: number;
      status: "PAID" | "PARTLY_PAID" | "OPEN";
    };

// A customer's grain — the Grain tab's content on their detail page.
// A real <table>, matching the app's standard table pattern (see
// DebtorTable.tsx) rather than CSS-grid rows. Rows are grouped into
// date headers, same "insert a header row whenever the date changes"
// pattern DailyLedgerRecords uses. Pure display; the data arrives as a
// prop from the Server Component page, same pattern as
// CustomerAccountsList.
//
// Stat cards up top — Shop owes this customer / Paid so far (money
// the SHOP owes, from settlements bought on Credit) and Owed by this
// customer / Collected so far (money the CUSTOMER owes, from grain
// THEY bought on Credit — see creditPurchases) — both directions
// shown together now that this section covers the whole Grain
// relationship, not just deposits. moneyOwedByProduct carries the
// shop's-own-debt figures PER PRODUCT — a customer's Cotton debt/
// payments and Wheat debt/payments are tracked, shown, and paid
// independently (see getShopOwedForGrainByProduct), never conflated
// with Stock Udhaar (a QUANTITY obligation from selling before
// settling, its own separate tab entirely).
export function CustomerGrainSection({
  deposits,
  moneyOwedByProduct,
  creditPurchases,
  customerId,
  customerName,
  onSettle,
  bankAccounts = [],
  products = [],
}: {
  deposits: Deposits;
  // Per product, plus each Udhaar grain purchase's own paid/remaining
  // keyed by its transaction id — the shop's repayments to this
  // customer are one pot spread oldest first (getShopOwedForGrainByProduct).
  moneyOwedByProduct: Map<
    string,
    { owed: number; paid: number; settlements: Record<string, { paid: number; remaining: number }> }
  >;
  // Grain this customer bought FROM the shop on Credit, still
  // outstanding — optional since a caller with no such concept yet
  // (e.g. a future embed) can simply omit it; the customer detail
  // page always passes it.
  creditPurchases?: CreditPurchases;
  customerId: string;
  customerName: string;
  // Optional refresh callback for a caller holding its own client-
  // side deposits state (StockFromCustomerForm) — when provided, an
  // unsettled row also gets a "Buy from customer" action, matching
  // that form's original table. The customer detail page (a Server
  // Component) omits this, since router.refresh() alone re-runs its
  // fetch.
  onSettle?: () => void;
  // Needed for edit modals — EditGrainSettlementModal's bank picker
  // and EditSaleModal's product picker (a credit-purchase row edits
  // through the same sale-edit flow every other sale uses). Both
  // optional with an empty default, same as other callers of this
  // component that don't need edit (e.g. StockFromCustomerForm, which
  // never shows a credit-purchase row at all).
  bankAccounts?: { id: string; name: string }[];
  products?: Product[];
}) {
  // Which grain type's section is showing — a plain tab switcher (see
  // the .tabs/.tab CSS class also used for the page-level tabs), kept
  // as local UI state rather than a URL param since it's nested a
  // level below the already-URL-driven Purchase history/Grain/Udhaar
  // tabs. Declared before the "no deposits yet" early return below so
  // hook-call order stays fixed across renders.
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [editingSettlement, setEditingSettlement] = useState<Extract<Row, { kind: "settlement" }> | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<Extract<Row, { kind: "unsettled" }> | null>(null);

  // Per-product quantity rollup — how much of THIS product the
  // customer has deposited in total, how much of that has actually
  // been priced/settled (a real purchase, Cash/Account/Credit alike),
  // and how much is still sitting here with no rate agreed yet. Built
  // straight off each batch (not the flattened/sorted `rows` below),
  // since a batch can have more than one settlement over time and
  // this needs every one of them summed, not just the latest.
  const quantityByProduct = new Map<
    string,
    { productName: string; unitName: string; deposited: number; settled: number; unsettled: number; returned: number }
  >();
  for (const batch of deposits.batches) {
    const existing = quantityByProduct.get(batch.product.id) ?? {
      productName: batch.product.name,
      unitName: batch.product.unitName,
      deposited: 0,
      settled: 0,
      unsettled: 0,
      returned: 0,
    };
    const settledQty = batch.settlements.reduce((sum, s) => sum + s.quantity, 0);
    existing.deposited += settledQty + batch.unsettledQuantity + batch.returnedQuantity;
    existing.settled += settledQty;
    existing.unsettled += batch.unsettledQuantity;
    existing.returned += batch.returnedQuantity;
    quantityByProduct.set(batch.product.id, existing);
  }

  if (deposits.batches.length === 0 && (creditPurchases ?? []).length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No grain deposits yet.
        </p>
      </div>
    );
  }

  const rows: Row[] = [];
  for (const batch of deposits.batches) {
    for (const s of batch.settlements) {
      rows.push({
        kind: "settlement",
        key: s.batchId,
        transactionId: s.transactionId,
        date: s.receivedAt,
        productId: batch.product.id,
        productName: batch.product.name,
        unitName: batch.product.unitName,
        quantity: s.quantity,
        rate: s.rate,
        amount: s.quantity * s.rate,
        paymentMethod: s.paymentMethod,
      });
    }
    for (const r of batch.returns) {
      rows.push({
        kind: "returned",
        key: r.id,
        id: r.id,
        batchId: batch.id,
        batchUnsettled: batch.unsettledQuantity,
        notes: r.notes,
        date: r.returnDate,
        productId: batch.product.id,
        productName: batch.product.name,
        unitName: batch.product.unitName,
        quantity: r.quantity,
        reference: r.reference,
      });
    }
    if (batch.unsettledQuantity > 0) {
      rows.push({
        kind: "unsettled",
        key: `${batch.id}-unsettled`,
        batchId: batch.id,
        date: batch.receivedAt,
        productId: batch.product.id,
        productName: batch.product.name,
        unitName: batch.product.unitName,
        quantity: batch.unsettledQuantity,
        reference: batch.reference ?? null,
        // Sold from or partly given back — edit/delete the deposit is then locked.
        hasBeenSold: batch.quantitySold > 0 || batch.returnedQuantity > 0,
      });
    }
  }
  for (const r of creditPurchases ?? []) {
    rows.push({
      kind: "credit-purchase",
      key: r.dailySaleItemId,
      dailySaleItemId: r.dailySaleItemId,
      dailySaleId: r.dailySaleId,
      date: r.purchaseDate,
      productId: r.productId,
      productName: r.productName,
      unitName: r.unitName,
      quantity: r.quantity,
      rate: r.rate,
      remaining: r.remaining,
      status: r.status,
    });
  }
  // Newest first within each product's own rows, matching Sales
  // History's ordering.
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Group rows by product so each grain type gets its own section
  // (own stat cards, own records table) rather than one flat list —
  // per the "overall at top, then one section per grain type the
  // customer has any record in" layout decision. Ordered by whichever
  // product has the most recent activity first, same ordering the old
  // flat list used.
  const rowsByProduct = new Map<string, Row[]>();
  for (const row of rows) {
    const existing = rowsByProduct.get(row.productId);
    if (existing) existing.push(row);
    else rowsByProduct.set(row.productId, [row]);
  }
  const productIds = Array.from(rowsByProduct.keys()).sort((a, b) => {
    const aLatest = rowsByProduct.get(a)![0].date.getTime();
    const bLatest = rowsByProduct.get(b)![0].date.getTime();
    return bLatest - aLatest;
  });
  const selectedProductId = activeProductId && productIds.includes(activeProductId) ? activeProductId : productIds[0];

  return (
    <>
      <div className="tabs">
        {productIds.map((productId) => (
          <button
            key={productId}
            type="button"
            className={`tab${productId === selectedProductId ? " active" : ""}`}
            onClick={() => setActiveProductId(productId)}
          >
            {quantityByProduct.get(productId)?.productName ?? rowsByProduct.get(productId)![0].productName}
          </button>
        ))}
      </div>

      {(() => {
        const productId = selectedProductId;
        const productRows = rowsByProduct.get(productId)!;
        const q = quantityByProduct.get(productId);
        const owedForProduct = moneyOwedByProduct.get(productId);
        const customerOwedForProduct = productRows
          .filter((r): r is Extract<Row, { kind: "credit-purchase" }> => r.kind === "credit-purchase")
          .reduce((sum, r) => sum + r.remaining, 0);

        return (
          <div key={productId}>
            {q && (
              <div className="stat-grid" style={{ marginBottom: 12 }}>
                <div className="stat-card">
                  <p className="stat-label">Total deposited</p>
                  <p className="stat-value tone-grain">
                    {q.deposited} {q.unitName}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Settled (rate agreed)</p>
                  <p className="stat-value tone-primary">
                    {q.settled} {q.unitName}
                  </p>
                </div>
                {q.returned > 0 && (
                  <div className="stat-card">
                    <p className="stat-label">Given back (no rate)</p>
                    <p className="stat-value tone-grain">
                      {q.returned} {q.unitName}
                    </p>
                  </div>
                )}
                {q.unsettled > 0 && (
                  <div className="stat-card">
                    <p className="stat-label">Rate not settled</p>
                    <p className="stat-value tone-consigned">
                      {q.unsettled} {q.unitName}
                    </p>
                  </div>
                )}
                {owedForProduct && owedForProduct.owed > 0 && (
                  <div className="stat-card">
                    <p className="stat-label">Shop owes for this</p>
                    <p className="stat-value tone-consigned">{formatMoney(owedForProduct.owed)}</p>
                    {/* One repayment for everything the shop owes this
                        customer, spread oldest first. */}
                    <ShopUdhaarPaymentModal
                      customerId={customerId}
                      customerName={customerName}
                      bankAccounts={bankAccounts}
                      triggerLabel="Pay now"
                      triggerClassName="btn btn-primary stat-card-action"
                      onRecorded={onSettle}
                    />
                  </div>
                )}
                {customerOwedForProduct > 0 && (
                  <div className="stat-card">
                    <p className="stat-label">Customer owes for this</p>
                    <p className="stat-value tone-consigned">{formatMoney(customerOwedForProduct)}</p>
                    <CustomerUdhaarPaymentModal
                      customerId={customerId}
                      customerName={customerName}
                      bankAccounts={bankAccounts}
                      triggerLabel="Receive payment"
                      triggerClassName="btn btn-primary stat-card-action"
                      onRecorded={onSettle}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="panel">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: "right" }}>Quantity</th>
                    <th style={{ textAlign: "right" }}>Rate</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((row) => (
                    <tr key={row.key}>
                      <td>{formatDate(row.date)}</td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {row.quantity} {row.unitName}
                      </td>
                      {row.kind === "settlement" ? (
                        <>
                          <td className="num" style={{ textAlign: "right" }}>
                            {formatMoney(row.rate)}
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>
                            {formatMoney(row.amount)}
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                              {row.paymentMethod === "CREDIT" ? (
                                (() => {
                                  const status = row.transactionId
                                    ? moneyOwedByProduct.get(row.productId)?.settlements[row.transactionId]
                                    : undefined;
                                  if (status && status.remaining <= 0.01) {
                                    return <span className="pay-badge pay-cash">Paid</span>;
                                  }
                                  if (status && status.paid > 0.01) {
                                    return (
                                      <span className="pay-badge pay-mixed">
                                        Shop owes {formatMoney(status.remaining)}
                                      </span>
                                    );
                                  }
                                  return <span className="pay-badge pay-credit">Udhaar — shop owes</span>;
                                })()
                              ) : (
                                <span className="pay-badge pay-cash">
                                  Paid — {row.paymentMethod === "ACCOUNT" ? "Account" : "Cash"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {row.transactionId && (
                              <div className="row-actions">
                                <button className="icon-btn" onClick={() => setEditingSettlement(row)} title="Edit">
                                  <svg className="icon" viewBox="0 0 24 24">
                                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                                  </svg>
                                </button>
                                <DeleteGrainSettlementButton accountTransactionId={row.transactionId} />
                              </div>
                            )}
                          </td>
                        </>
                      ) : row.kind === "returned" ? (
                        <>
                          <td className="num" style={{ textAlign: "right" }}>
                            —
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>
                            —
                          </td>
                          <td>
                            <span className="pay-badge pay-mixed" style={{ color: "var(--grain-600)" }}>
                              Given back — no rate
                            </span>
                            <span style={{ marginLeft: 8, fontSize: 12.5, color: "var(--ink-muted)" }}>
                              Ref: {row.reference}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <GiveBackGrainModal
                                grainBatchId={row.batchId}
                                customerName={customerName}
                                productName={row.productName}
                                unsettledQuantity={row.batchUnsettled}
                                unitName={row.unitName}
                                existing={{
                                  id: row.id,
                                  quantity: row.quantity,
                                  returnDate: row.date,
                                  reference: row.reference,
                                  notes: row.notes,
                                }}
                                onDone={onSettle}
                              />
                            </div>
                          </td>
                        </>
                      ) : row.kind === "unsettled" ? (
                        <>
                          <td className="num" style={{ textAlign: "right" }}>
                            —
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>
                            —
                          </td>
                          <td>
                            <span className="pay-badge pay-mixed">Rate not settled</span>
                            {row.reference && (
                              <span style={{ marginLeft: 8, fontSize: 12.5, color: "var(--ink-muted)" }}>
                                Ref: {row.reference}
                              </span>
                            )}
                          </td>
                          <td>
                            {/* Actions sit at the row's right end: Buy from
                                customer, Give back, then edit/delete. */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                gap: 8,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {/* Both everywhere this list shows — the customer
                                  page and New entry's Buy/Keep stock. */}
                              <BuyFromCustomerModal
                                grainBatchId={row.batchId}
                                customerName={customerName}
                                remainingClaim={row.quantity}
                                unitName={row.unitName}
                                onDone={onSettle}
                              />
                              <GiveBackGrainModal
                                grainBatchId={row.batchId}
                                customerName={customerName}
                                productName={row.productName}
                                unsettledQuantity={row.quantity}
                                unitName={row.unitName}
                                onDone={onSettle}
                              />
                              {!row.hasBeenSold && (
                                <div className="row-actions">
                                  <button className="icon-btn" onClick={() => setEditingDeposit(row)} title="Edit">
                                    <svg className="icon" viewBox="0 0 24 24">
                                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                                    </svg>
                                  </button>
                                  <DeleteGrainDepositButton batchId={row.batchId} />
                                </div>
                              )}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="num" style={{ textAlign: "right" }}>
                            {formatMoney(row.rate)}
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>
                            {formatMoney(row.quantity * row.rate)}
                          </td>
                          <td>
                            {/* Paid down by the customer's overall Udhaar
                                payments (oldest first), not per row. */}
                            {row.status === "PAID" ? (
                              <span className="pay-badge pay-cash">Paid</span>
                            ) : row.status === "PARTLY_PAID" ? (
                              <span className="pay-badge pay-mixed">Customer owes {formatMoney(row.remaining)}</span>
                            ) : (
                              <span className="pay-badge pay-credit">Customer owes</span>
                            )}
                          </td>
                          <td>
                            <div className="row-actions">
                              <SaleVisitActions
                                dailySaleId={row.dailySaleId}
                                visitAt={row.date}
                                products={products}
                                bankAccounts={bankAccounts}
                              />
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {editingSettlement && (
        <EditGrainSettlementModal
          accountTransactionId={editingSettlement.transactionId!}
          initialQuantity={editingSettlement.quantity}
          initialRate={editingSettlement.rate}
          initialPaymentMethod={editingSettlement.paymentMethod}
          unitName={editingSettlement.unitName}
          bankAccounts={bankAccounts}
          onClose={() => setEditingSettlement(null)}
        />
      )}
      {editingDeposit && (
        <EditGrainDepositModal
          batchId={editingDeposit.batchId}
          initialQuantity={editingDeposit.quantity}
          unitName={editingDeposit.unitName}
          onClose={() => setEditingDeposit(null)}
        />
      )}
    </>
  );
}
