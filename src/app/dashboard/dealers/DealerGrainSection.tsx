import Link from "next/link";
import {
  getDealerGrainPurchaseSummary,
  listDealerGrainBatches,
  listDealers,
} from "@/modules/dealers/actions";
import { listProducts } from "@/modules/products/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { RecordDealerGrainPurchaseModal } from "@/modules/dealers/components/RecordDealerGrainPurchaseModal";

// Dealer → Grain tab — bulk grain bought from GRAIN dealers. Overview
// stats and the full purchase history (each row links to that
// dealer's own detail page, where their running balance and "Pay
// dealer" action live). Every batch recorded here already flows into
// the Grain page's normal Own-stock figures (see
// createDealerGrainPurchase — a dealer batch is always shop-owned),
// so this tab is purely the dealer-Udhaar/purchase-history view, not
// a second stock ledger.
export async function DealerGrainSection() {
  const [summary, batches, dealers, products, bankAccounts] = await Promise.all([
    getDealerGrainPurchaseSummary(),
    listDealerGrainBatches(),
    listDealers({ type: "GRAIN" }),
    listProducts({ stockKind: "GRAIN", pageSize: 500 }),
    listBankAccounts(),
  ]);

  return (
    <>
      <div className="page-head" style={{ marginBottom: 8 }}>
        <div />
        <RecordDealerGrainPurchaseModal dealers={dealers} products={products.products} bankAccounts={bankAccounts} />
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
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={6}>No purchases recorded yet.</td>
              </tr>
            ) : (
              batches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <Link href={`/dashboard/dealers/${batch.dealerId}`} className="name-link">
                      {batch.dealerName}
                    </Link>
                  </td>
                  <td>{batch.productName}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {batch.quantity} {batch.unitName}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(batch.rate)}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatMoney(batch.amount)}
                  </td>
                  <td>{formatDate(batch.receivedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
