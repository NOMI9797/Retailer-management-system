import Link from "next/link";
import {
  getDealerProductPurchaseSummary,
  listDealerProductPurchases,
  listDealers,
} from "@/modules/dealers/actions";
import { listProducts } from "@/modules/products/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { RecordDealerProductPurchaseModal } from "@/modules/dealers/components/RecordDealerProductPurchaseModal";

// Dealer → Products tab — bulk Simple-stock bought from PRODUCTS
// dealers. Overview stats and the full purchase history (each row
// links to that dealer's own detail page, where their running
// balance and "Pay dealer" action live). Not cached — a shopkeeper
// recording a purchase right here expects this page to reflect it on
// the very next load, same reasoning as every other "nothing cached"
// financial overview in the app.
export async function DealerProductsSection() {
  const [summary, purchasesResult, dealers, products, bankAccounts] = await Promise.all([
    getDealerProductPurchaseSummary(),
    listDealerProductPurchases(),
    listDealers({ type: "PRODUCTS" }),
    listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
    listBankAccounts(),
  ]);

  return (
    <>
      <div className="page-head" style={{ marginBottom: 8 }}>
        <div />
        <RecordDealerProductPurchaseModal dealers={dealers} products={products.products} bankAccounts={bankAccounts} />
      </div>

      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <div className="stat-card">
          <p className="stat-label">Total spent</p>
          <p className="stat-value tone-primary">{formatMoney(summary.totalSpent)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total owed to dealers</p>
          <p className={`stat-value${summary.totalOwed ? " tone-consigned" : ""}`}>
            {formatMoney(summary.totalOwed)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Active dealers</p>
          <p className="stat-value">{summary.dealerCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Purchases recorded</p>
          <p className="stat-value">{summary.purchaseCount}</p>
        </div>
      </div>

      <h2 className="section-title">Purchase history</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Dealer</th>
              <th>Product</th>
              <th style={{ textAlign: "right" }}>Quantity</th>
              <th style={{ textAlign: "right" }}>Cost</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Payment</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {purchasesResult.purchases.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={7}>No purchases recorded yet.</td>
              </tr>
            ) : (
              purchasesResult.purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>
                    <Link href={`/dashboard/dealers/${purchase.dealerId}`} className="name-link">
                      {purchase.dealerName}
                    </Link>
                  </td>
                  <td>{purchase.productName}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {purchase.quantity}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(purchase.costPrice)}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatMoney(purchase.amount)}
                  </td>
                  <td>
                    <span
                      className={`pay-badge ${
                        purchase.paymentMethod === "CASH"
                          ? "pay-cash"
                          : purchase.paymentMethod === "ACCOUNT"
                            ? "pay-account"
                            : "pay-credit"
                      }`}
                    >
                      {purchase.paymentMethod === "CREDIT" ? "Udhaar" : purchase.paymentMethod}
                    </span>
                  </td>
                  <td>{formatDate(purchase.purchaseDate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
