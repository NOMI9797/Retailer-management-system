import { Fragment } from "react";
import type { getCustomerGrainDeposits } from "../actions";
import type { getCustomerGrainCreditPurchases } from "@/modules/daily-sales/actions";
import { PayGrainDebtModal } from "./PayGrainDebtModal";
import { BuyFromCustomerModal } from "./BuyFromCustomerModal";
import { PayGrainSaleItemCreditModal } from "@/modules/daily-sales/components/PayGrainSaleItemCreditModal";
import { formatMoney, formatDate } from "@/lib/utils";

type Deposits = Awaited<ReturnType<typeof getCustomerGrainDeposits>>;
type CreditPurchases = Awaited<ReturnType<typeof getCustomerGrainCreditPurchases>>;

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
      kind: "settlement";
      key: string;
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
      // customer" action (see onSettle below); the deposit-batch
      // rows elsewhere in the app key off this same id.
      batchId: string;
      date: Date;
      productId: string;
      productName: string;
      unitName: string;
      quantity: number;
    }
  | {
      kind: "credit-purchase";
      key: string;
      dailySaleItemId: string;
      date: Date;
      productId: string;
      productName: string;
      unitName: string;
      quantity: number;
      rate: number;
      remaining: number;
    };

// A customer's grain — the Grain tab's content on their detail page.
// A real <table>, matching the app's standard table pattern (see
// DebtorTable.tsx) rather than CSS-grid rows. Rows are grouped into
// date headers, same "insert a header row whenever the date changes"
// pattern SalesHistoryTable uses. Pure display; the data arrives as a
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
}: {
  deposits: Deposits;
  moneyOwedByProduct: Map<string, { owed: number; paid: number }>;
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
}) {
  const totalMoneyOwed = Array.from(moneyOwedByProduct.values()).reduce((sum, v) => sum + v.owed, 0);
  const totalPaidSoFar = Array.from(moneyOwedByProduct.values()).reduce((sum, v) => sum + v.paid, 0);
  const totalCustomerOwed = (creditPurchases ?? []).reduce((sum, r) => sum + r.remaining, 0);
  const totalCustomerPaid = (creditPurchases ?? []).reduce((sum, r) => sum + r.paid, 0);

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
      });
    }
  }
  for (const r of creditPurchases ?? []) {
    rows.push({
      kind: "credit-purchase",
      key: r.dailySaleItemId,
      dailySaleItemId: r.dailySaleItemId,
      date: r.purchaseDate,
      productId: r.productId,
      productName: r.productName,
      unitName: r.unitName,
      quantity: r.quantity,
      rate: r.rate,
      remaining: r.remaining,
    });
  }
  // Newest first, matching Sales History's ordering.
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());

  let lastDateKey: string | null = null;

  return (
    <>
      {(totalMoneyOwed > 0 || totalPaidSoFar > 0 || totalCustomerOwed > 0 || totalCustomerPaid > 0) && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          {totalMoneyOwed > 0 && (
            <div className="stat-card">
              <p className="stat-label">Shop owes this customer</p>
              <p className="stat-value tone-consigned">{formatMoney(totalMoneyOwed)}</p>
            </div>
          )}
          {totalPaidSoFar > 0 && (
            <div className="stat-card">
              <p className="stat-label">Paid so far</p>
              <p className="stat-value tone-primary">{formatMoney(totalPaidSoFar)}</p>
            </div>
          )}
          {totalCustomerOwed > 0 && (
            <div className="stat-card">
              <p className="stat-label">Owed by this customer</p>
              <p className="stat-value tone-consigned">{formatMoney(totalCustomerOwed)}</p>
            </div>
          )}
          {totalCustomerPaid > 0 && (
            <div className="stat-card">
              <p className="stat-label">Collected so far</p>
              <p className="stat-value tone-primary">{formatMoney(totalCustomerPaid)}</p>
            </div>
          )}
        </div>
      )}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th style={{ textAlign: "right" }}>Quantity</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const dateKey = formatDate(row.date);
              const isNewDay = dateKey !== lastDateKey;
              lastDateKey = dateKey;

              return (
                <Fragment key={row.key}>
                  {isNewDay && (
                    <tr className="table-date-header">
                      <td colSpan={5}>{dateKey}</td>
                    </tr>
                  )}
                  <tr>
                    <td>{row.productName}</td>
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
                              <>
                                <span className="pay-badge pay-credit">Udhaar</span>
                                {(moneyOwedByProduct.get(row.productId)?.owed ?? 0) > 0 && (
                                  <PayGrainDebtModal
                                    customerId={customerId}
                                    productId={row.productId}
                                    customerName={customerName}
                                    amountOwed={moneyOwedByProduct.get(row.productId)!.owed}
                                    defaultAmount={Math.min(row.amount, moneyOwedByProduct.get(row.productId)!.owed)}
                                    label="Mark as paid"
                                  />
                                )}
                              </>
                            ) : (
                              <span className="pay-badge pay-cash">
                                Paid — {row.paymentMethod === "ACCOUNT" ? "Account" : "Cash"}
                              </span>
                            )}
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
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <span className="pay-badge pay-mixed">Not yet settled</span>
                            {onSettle && (
                              <BuyFromCustomerModal
                                grainBatchId={row.batchId}
                                customerName={customerName}
                                remainingClaim={row.quantity}
                                unitName={row.unitName}
                                onDone={onSettle}
                              />
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
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <span className="pay-badge pay-credit">Customer owes</span>
                            <PayGrainSaleItemCreditModal
                              dailySaleItemId={row.dailySaleItemId}
                              customerName={customerName}
                              remaining={row.remaining}
                            />
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
