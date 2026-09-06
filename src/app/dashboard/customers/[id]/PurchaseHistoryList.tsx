"use client";

import { useState } from "react";
import { formatMoney, formatDate } from "@/lib/utils";
import { EditSaleModal } from "@/modules/daily-sales/components/EditSaleModal";
import { DeleteSaleButton } from "@/modules/daily-sales/components/DeleteSaleButton";
import type { getCustomerPurchaseHistory } from "@/modules/daily-sales/actions";
import type { listProducts } from "@/modules/products/actions";

type Sale = Awaited<ReturnType<typeof getCustomerPurchaseHistory>>[number];
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

// Every item bought, at what price, on what date — pulled directly
// from the same DailySale/DailySaleItem rows Daily Sales wrote, not a
// copy. Exists for every sale, cash or on-account (unlike the
// Accounts panel above, which only shows entries where money is
// actually outstanding). Edit/delete on a past sale lives here, per
// the milestone — reversing and reapplying stock/batch/ledger effects
// correctly, not just overwriting the row.
//
// A customer who comes back a second (or third) time on the same day
// still gets one DailySale row for that date (see findTodaysSale in
// actions.ts), so each sale can hold more than one "visit" — each
// visit is rendered as its own clearly separated sub-block (own item
// table, own payment line, own total) instead of mixing every visit's
// items into one undifferentiated list.
export function PurchaseHistoryList({ sales, products }: { sales: Sale[]; products: Product[] }) {
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  if (sales.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No purchases yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        {sales.map((sale) => {
          const totalItems = sale.visits.reduce((sum, v) => sum + v.items.length, 0);
          const dayTotal = sale.visits.reduce((sum, v) => sum + v.total, 0);
          const showVisitLabels = sale.visits.length > 1;

          return (
            <div className="grain-card" key={sale.id}>
              <div className="grain-head" style={{ cursor: "default" }}>
                <div className="grain-head-left">
                  <div>
                    <p className="grain-name">{formatDate(sale.saleDate)}</p>
                    <p className="grain-sub">
                      {totalItems} item{totalItems === 1 ? "" : "s"}
                      {showVisitLabels ? ` · ${sale.visits.length} visits` : ""}
                    </p>
                  </div>
                </div>
                <div className="grain-total">
                  <p>Total</p>
                  <p>{formatMoney(dayTotal)}</p>
                </div>
              </div>

              {sale.visits.map((visit, vi) => (
                <div
                  key={visit.visitAt.toString()}
                  style={{
                    marginTop: vi === 0 ? 0 : 14,
                    paddingTop: vi === 0 ? 0 : 14,
                    borderTop: vi === 0 ? undefined : "2px solid var(--ink)",
                  }}
                >
                  <div className="batch-list">
                    <div className="batch-row head">
                      <span>Product</span>
                      <span>Quantity</span>
                      <span>Price</span>
                      <span></span>
                    </div>
                    {visit.items.map((item) => (
                      <div className="batch-row" key={item.id}>
                        <span>{item.productName}</span>
                        <span>{item.quantity}</span>
                        <span>{formatMoney(item.actualPrice)}</span>
                        <span></span>
                      </div>
                    ))}
                  </div>

                  <p style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 8 }}>
                    {visit.payments.length === 0
                      ? "No payment recorded"
                      : visit.payments
                          .map(
                            (p) =>
                              `${p.paymentMethod.charAt(0) + p.paymentMethod.slice(1).toLowerCase()}: ${formatMoney(p.amount)}`
                          )
                          .join(" · ")}
                  </p>
                </div>
              ))}

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => setEditingSaleId(sale.id)}>
                  Edit
                </button>
                <DeleteSaleButton saleId={sale.id} />
              </div>
            </div>
          );
        })}
      </div>

      {editingSaleId && (
        <EditSaleModal
          saleId={editingSaleId}
          products={products}
          onClose={() => setEditingSaleId(null)}
        />
      )}
    </>
  );
}
