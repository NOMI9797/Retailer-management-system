"use client";

import { Fragment, useState } from "react";
import { formatMoney, formatDate } from "@/lib/utils";
import { EditSaleModal } from "@/modules/daily-sales/components/EditSaleModal";
import { DeleteSaleButton } from "@/modules/daily-sales/components/DeleteSaleButton";
import type { getCustomerPurchaseHistory } from "@/modules/daily-sales/actions";
import type { listProducts } from "@/modules/products/actions";

type Sale = Awaited<ReturnType<typeof getCustomerPurchaseHistory>>[number];
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

function paymentBadgeClass(method: string) {
  if (method === "CASH") return "pay-cash";
  if (method === "ACCOUNT") return "pay-account";
  return "pay-credit";
}

function paymentLabel(method: string) {
  if (method === "CREDIT") return "Udhaar";
  return method.charAt(0) + method.slice(1).toLowerCase();
}

// Every item bought, at what price, on what date — pulled directly
// from the same DailySale/DailySaleItem rows Daily Sales wrote, not a
// copy. Exists for every sale, cash or on-account (unlike the
// Accounts panel above, which only shows entries where money is
// actually outstanding). Edit/delete on a past sale lives here, per
// the milestone — reversing and reapplying stock/batch/ledger effects
// correctly, not just overwriting the row. Flat table, same shape as
// the Expenses table — one date-header row per day, then one row per
// item; Edit/Delete act on the whole visit (not a single item), so
// they only appear once, on that visit's last item row.
export function PurchaseHistoryList({ sales, products }: { sales: Sale[]; products: Product[] }) {
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

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
              <th>Product</th>
              <th style={{ textAlign: "right" }}>Quantity</th>
              <th>Payment</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <Fragment key={sale.id}>
                <tr className="table-date-header">
                  <td colSpan={5}>{formatDate(sale.saleDate)}</td>
                </tr>
                {sale.visits.map((visit, visitIndex) =>
                  visit.items.map((item, itemIndex) => {
                    const isLastItemInVisit = itemIndex === visit.items.length - 1;
                    return (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td className="num" style={{ textAlign: "right" }}>
                          {item.quantity}
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
                              <button className="icon-btn" onClick={() => setEditingSaleId(sale.id)} title="Edit">
                                <svg className="icon" viewBox="0 0 24 24">
                                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                                </svg>
                              </button>
                              <DeleteSaleButton saleId={sale.id} />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {editingSaleId && (
        <EditSaleModal saleId={editingSaleId} products={products} onClose={() => setEditingSaleId(null)} />
      )}
    </>
  );
}
