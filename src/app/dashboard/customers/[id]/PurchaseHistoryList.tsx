"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/utils";
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
          const total = sale.items.reduce((sum, i) => sum + i.actualPrice * i.quantity, 0);
          return (
            <div className="grain-card" key={sale.id}>
              <div className="grain-head" style={{ cursor: "default" }}>
                <div className="grain-head-left">
                  <div>
                    <p className="grain-name">{new Date(sale.saleDate).toLocaleDateString()}</p>
                    <p className="grain-sub">
                      {sale.items.length} item{sale.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="grain-total">
                  <p>Total</p>
                  <p>{formatMoney(total)}</p>
                </div>
              </div>

              <div className="batch-list">
                <div className="batch-row head">
                  <span>Product</span>
                  <span>Quantity</span>
                  <span>Price</span>
                  <span></span>
                </div>
                {sale.items.map((item) => (
                  <div className="batch-row" key={item.id}>
                    <span>{item.productName}</span>
                    <span>{item.quantity}</span>
                    <span>{formatMoney(item.actualPrice)}</span>
                    <span></span>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 8 }}>
                {sale.payments.length === 0
                  ? "No payment recorded"
                  : sale.payments
                      .map((p) => `${p.paymentMethod.charAt(0) + p.paymentMethod.slice(1).toLowerCase()}: ${formatMoney(p.amount)}`)
                      .join(" · ")}
              </p>

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
