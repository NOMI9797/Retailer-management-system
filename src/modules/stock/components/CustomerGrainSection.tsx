import { Fragment } from "react";
import type { getCustomerGrainDeposits } from "../actions";
import { PayGrainDebtModal } from "./PayGrainDebtModal";
import { BuyFromCustomerModal } from "./BuyFromCustomerModal";
import { formatMoney, formatDate } from "@/lib/utils";

type Deposits = Awaited<ReturnType<typeof getCustomerGrainDeposits>>;

// One row's worth of detail — either a real settlement (a specific
// purchase, with its own date/quantity/rate/amount/paid-or-Udhaar
// status) or the still-unsettled remainder of a deposit, which has no
// rate/amount yet. Flattened out of every batch's settlements array so
// each purchase event gets its OWN row — matches how Purchase History
// breaks a day into separate visits, rather than one combined summary
// line per deposit (see the Grain page's GrainBatchList.tsx for that
// coarser view, which is fine there since it's scanning many
// customers at once; here, on ONE customer's own page, the full
// event-by-event detail is what's useful).
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
    };

// A customer's grain — the Grain tab's content on their detail page.
// A real <table>, matching the app's standard table pattern (see
// DebtorTable.tsx) rather than CSS-grid rows. Rows are grouped into
// date headers, same "insert a header row whenever the date changes"
// pattern SalesHistoryTable uses. Pure display; the data arrives as a
// prop from the Server Component page, same pattern as
// CustomerAccountsList.
//
// Four stat cards up top — Total deposited, Remaining (unsettled),
// and (only when nonzero) Shop owes this customer / Paid so far — a
// quick "at a glance" summary before the row-by-row detail below,
// same "stat cards above a table" shape used everywhere else in the
// app. moneyOwedByProduct carries both figures PER PRODUCT — a
// customer's Cotton debt/payments and Wheat debt/payments are
// tracked, shown, and paid independently (see
// getShopOwedForGrainByProduct), never conflated with Stock Udhaar (a
// QUANTITY obligation from selling before settling, its own separate
// tab entirely). "Paid so far" exists specifically so a payment a
// shopkeeper already made isn't just implied by "owed" going down —
// it has its own visible record.
export function CustomerGrainSection({
  deposits,
  moneyOwedByProduct,
  customerId,
  customerName,
  onSettle,
}: {
  deposits: Deposits;
  moneyOwedByProduct: Map<string, { owed: number; paid: number }>;
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
  if (deposits.batches.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No grain deposits yet.
        </p>
      </div>
    );
  }

  // Totals across every batch/product this customer has deposited —
  // shown per-unit-name where every deposit shares one unit (the
  // common case), or per-product when they've deposited more than one
  // kind of grain, since "40 kg + 10 Ton" can't be summed into one
  // number.
  const totalsByUnit = new Map<string, number>();
  const remainingByUnit = new Map<string, number>();
  for (const batch of deposits.batches) {
    totalsByUnit.set(batch.product.unitName, (totalsByUnit.get(batch.product.unitName) ?? 0) + batch.quantityIn);
    remainingByUnit.set(
      batch.product.unitName,
      (remainingByUnit.get(batch.product.unitName) ?? 0) + batch.unsettledQuantity
    );
  }
  const formatByUnit = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([unit, qty]) => `${qty} ${unit}`)
      .join(" · ");

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
  // Newest first, matching Sales History's ordering.
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());

  let lastDateKey: string | null = null;

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <p className="stat-label">Total deposited</p>
          <p className="stat-value">{formatByUnit(totalsByUnit)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Remaining (unsettled)</p>
          <p className="stat-value tone-grain">{formatByUnit(remainingByUnit)}</p>
        </div>
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
      </div>
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
                          {row.paymentMethod === "CREDIT" ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
                            </div>
                          ) : (
                            <span className="pay-badge pay-cash">
                              Paid — {row.paymentMethod === "ACCOUNT" ? "Account" : "Cash"}
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="num" style={{ textAlign: "right" }}>
                          —
                        </td>
                        <td className="num" style={{ textAlign: "right" }}>
                          —
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
