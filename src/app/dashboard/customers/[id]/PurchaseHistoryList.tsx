"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { formatMoney, formatDate } from "@/lib/utils";
import { SaleVisitActions } from "@/modules/daily-sales/components/SaleVisitActions";
import { EditAccountTransactionModal } from "@/modules/customers/components/EditAccountTransactionModal";
import { DeleteAccountTransactionButton } from "@/modules/customers/components/DeleteAccountTransactionButton";
import { EditGrainSettlementModal } from "@/modules/stock/components/EditGrainSettlementModal";
import { DeleteGrainSettlementButton } from "@/modules/stock/components/DeleteGrainSettlementButton";
import type { getCustomerPurchaseHistory } from "@/modules/daily-sales/actions";
import type { listProducts } from "@/modules/products/actions";

type Sale = Awaited<ReturnType<typeof getCustomerPurchaseHistory>>[number];
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

function paymentBadgeClass(method: string) {
  if (method === "CASH") return "pay-cash";
  if (method === "ACCOUNT") return "pay-account";
  return "pay-credit";
}

// Who this row was done by — the customer (bought, owes, paid) or the
// shop (bought grain from them / paid them for it). Grey for the
// customer, amber (the app's grain colour) for the shop.
function ByBadge({ by }: { by: "CUSTOMER" | "SHOP" }) {
  return by === "SHOP" ? (
    <span className="pay-badge pay-account">Shop</span>
  ) : (
    <span className="pay-badge pay-mixed">Customer</span>
  );
}

function paymentLabel(method: string) {
  if (method === "CREDIT") return "Udhaar";
  return method.charAt(0) + method.slice(1).toLowerCase();
}

// Every item bought, at what price, on what date — pulled directly
// from the same DailySale/DailySaleItem rows Daily Sales wrote, not a
// copy. Exists for every sale, cash or on-account. Also shows this
// customer's Udhaar Clearances (repayments) AND any loan given on the
// Regular/Daily Udhaar bucket — whether a manually recorded one or an
// imported legacy balance (see ImportUdhaarModal) — merged into the
// same date-sorted feed, each tagged distinctly, same "every kind of
// activity in one history" shape as the shop-wide Sales History
// table. Edit/delete on a past sale lives here, per the milestone —
// reversing and reapplying stock/batch/ledger effects correctly.
// Clearances/loans-given also get Edit/Delete here now (see
// EditAccountTransactionModal/DeleteAccountTransactionButton), both
// pointed at the plain AccountTransaction reversal — editing
// direction/bucket isn't supported (delete + re-add instead), same
// restriction updateAccountTransaction's own schema comment explains.
// Flat table with a Date column on each row (same as the Udhaar to
// Shop tab), one row per item; a multi-item visit shows its date once,
// on its first item. Edit/Delete act on the whole visit (not a single
// item), so they only appear once, on that visit's last item row.
export function PurchaseHistoryList({ sales, products, bankAccounts = [] }: { sales: Sale[]; products: Product[]; bankAccounts?: { id: string; name: string }[] }) {
  // A grain purchase from the customer — edited through the same
  // settlement edit the Grain tab uses (it also moves stock).
  const [editingGrain, setEditingGrain] = useState<Extract<Sale, { kind: "SHOP_GRAIN" }> | null>(null);
  const [editingTxn, setEditingTxn] = useState<Extract<Sale, { kind: "UDHAAR_CLEARANCE" | "UDHAAR_GIVEN" | "SHOP_UDHAAR_CLEARED" | "SHOP_GRAIN" }> | null>(null);

  if (sales.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>No purchases yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>By</th>
              <th>Product</th>
              <th style={{ textAlign: "right" }}>Quantity</th>
              <th>Payment</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((entry) => (
              <Fragment key={entry.id}>
                {entry.kind === "UDHAAR_CLEARANCE" ? (
                  <tr>
                    <td>{formatDate(entry.saleDate)}</td>
                    <td>
                      <ByBadge by="CUSTOMER" />
                    </td>
                    <td style={{ color: "var(--ink-muted)" }}>—</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      <span className="dash">—</span>
                    </td>
                    <td>
                      <span className="pay-badge pay-udhaar-cleared">Udhaar Cleared</span>
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--primary-600)" }}>
                      +{formatMoney(entry.amount)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => setEditingTxn(entry)} title="Edit">
                          <svg className="icon" viewBox="0 0 24 24">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                        <DeleteAccountTransactionButton transactionId={entry.id} />
                      </div>
                    </td>
                  </tr>
                ) : entry.kind === "UDHAAR_GIVEN" ? (
                  <tr>
                    <td>{formatDate(entry.saleDate)}</td>
                    <td>
                      <ByBadge by="CUSTOMER" />
                    </td>
                    <td style={{ color: "var(--ink-muted)" }}>
                      {entry.notes || "Udhaar recorded"}
                      {entry.reference && (
                        <div style={{ fontSize: 12 }}>Ref: {entry.reference}</div>
                      )}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      <span className="dash">—</span>
                    </td>
                    <td>
                      <span className="pay-badge pay-credit">Udhaar</span>
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--consigned-600)" }}>
                      {formatMoney(entry.amount)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => setEditingTxn(entry)} title="Edit">
                          <svg className="icon" viewBox="0 0 24 24">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                        <DeleteAccountTransactionButton transactionId={entry.id} />
                      </div>
                    </td>
                  </tr>
                ) : entry.kind === "SHOP_UDHAAR_CLEARED" ? (
                  <tr>
                    <td>{formatDate(entry.saleDate)}</td>
                    <td>
                      <ByBadge by="SHOP" />
                    </td>
                    <td style={{ color: "var(--ink-muted)" }}>Shop paid customer back</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      <span className="dash">—</span>
                    </td>
                    <td>
                      <span className="pay-badge pay-udhaar-cleared">Udhaar Cleared</span>
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--grain-600)" }}>
                      −{formatMoney(entry.amount)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => setEditingTxn(entry)} title="Edit">
                          <svg className="icon" viewBox="0 0 24 24">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                        <DeleteAccountTransactionButton transactionId={entry.id} />
                      </div>
                    </td>
                  </tr>
                ) : entry.kind === "SHOP_GRAIN" ? (
                  <tr>
                    <td>{formatDate(entry.saleDate)}</td>
                    <td>
                      <ByBadge by="SHOP" />
                    </td>
                    <td>
                      {entry.productName ?? "Grain"}
                      <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                        {entry.direction === "OUT" ? "Shop bought from customer" : "Shop paid customer for grain"}
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {entry.quantity !== null ? (
                        `${entry.quantity} ${entry.unitName ?? ""}`
                      ) : (
                        <span className="dash">—</span>
                      )}
                    </td>
                    <td>
                      {entry.direction === "OUT" && entry.paymentMethod === "CREDIT" ? (
                        entry.remaining !== null && entry.remaining <= 0.01 ? (
                          <span className="pay-badge pay-cash">Udhaar — paid</span>
                        ) : (
                          <span className="pay-badge pay-credit">
                            Udhaar — shop owes{entry.remaining !== null && entry.remaining < entry.amount - 0.01
                              ? ` ${formatMoney(entry.remaining)}`
                              : ""}
                          </span>
                        )
                      ) : (
                        <span className="pay-badge pay-cash">
                          Paid — {entry.paymentMethod === "ACCOUNT" ? "Account" : "Cash"}
                        </span>
                      )}
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--grain-600)" }}>
                      {formatMoney(entry.amount)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          onClick={() => (entry.direction === "OUT" ? setEditingGrain(entry) : setEditingTxn(entry))}
                          title="Edit"
                        >
                          <svg className="icon" viewBox="0 0 24 24">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                        {/* A purchase's delete also reverses its stock;
                            the shop paying for grain is a plain payment. */}
                        {entry.direction === "OUT" ? (
                          <DeleteGrainSettlementButton accountTransactionId={entry.id} />
                        ) : (
                          <DeleteAccountTransactionButton transactionId={entry.id} />
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  entry.visits.map((visit) =>
                    visit.items.map((item, itemIndex) => {
                      const isLastItemInVisit = itemIndex === visit.items.length - 1;
                      return (
                        <tr key={item.id}>
                          <td>{itemIndex === 0 ? formatDate(visit.visitAt) : null}</td>
                          <td>{itemIndex === 0 && <ByBadge by="CUSTOMER" />}</td>
                          <td>
                            {item.productName}
                            {/* Delivered straight from the seller's home, not the shop. */}
                            {item.fromHomeOf && (
                              <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
                                From{" "}
                                <Link href={`/dashboard/customers/${item.fromHomeOf.id}`} className="name-link">
                                  {item.fromHomeOf.name}
                                </Link>
                                &apos;s home
                              </div>
                            )}
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>
                            {item.quantity} {item.unitName}
                          </td>
                          <td>
                            {isLastItemInVisit &&
                              (visit.payments.length === 0 ? (
                                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>No payment</span>
                              ) : (
                                visit.payments.map((p) => (
                                  <span
                                    key={p.paymentMethod}
                                    className={`pay-badge ${paymentBadgeClass(p.paymentMethod)}`}
                                    style={{ marginRight: 6 }}
                                  >
                                    {paymentLabel(p.paymentMethod)}: {formatMoney(p.amount)}
                                  </span>
                                ))
                              ))}
                          </td>
                          <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                            {isLastItemInVisit ? formatMoney(visit.total) : formatMoney(item.actualPrice)}
                          </td>
                          <td>
                            {isLastItemInVisit && (
                              <div className="row-actions">
                                <SaleVisitActions
                                  dailySaleId={entry.id}
                                  visitAt={visit.visitAt}
                                  products={products}
                                  bankAccounts={bankAccounts}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {editingGrain && (
        <EditGrainSettlementModal
          accountTransactionId={editingGrain.id}
          initialQuantity={editingGrain.quantity ?? 0}
          initialRate={editingGrain.rate}
          initialPaymentMethod={editingGrain.paymentMethod}
          initialBankAccountId={editingGrain.bankAccountId}
          unitName={editingGrain.unitName ?? ""}
          bankAccounts={bankAccounts}
          onClose={() => setEditingGrain(null)}
        />
      )}
      {editingTxn && (
        <EditAccountTransactionModal
          transactionId={editingTxn.id}
          direction={editingTxn.kind === "UDHAAR_GIVEN" ? "OUT" : "IN"}
          subtitle={
            editingTxn.kind === "SHOP_UDHAAR_CLEARED"
              ? "Shop paid this customer back."
              : editingTxn.kind === "SHOP_GRAIN"
                ? "Shop paid this customer for grain."
                : undefined
          }
          initialAmount={editingTxn.amount}
          initialPaymentMethod={editingTxn.paymentMethod}
          initialBankAccountId={editingTxn.bankAccountId}
          initialDueDate={editingTxn.kind === "UDHAAR_GIVEN" ? editingTxn.dueDate : null}
          initialNotes={editingTxn.notes}
          initialReference={editingTxn.kind === "UDHAAR_GIVEN" ? editingTxn.reference : null}
          showReference={
            editingTxn.kind === "UDHAAR_GIVEN" &&
            (!!editingTxn.reference || !!editingTxn.notes?.startsWith("Imported from register"))
          }
          bankAccounts={bankAccounts}
          onClose={() => setEditingTxn(null)}
        />
      )}
    </>
  );
}
