import Link from "next/link";
import { getDealer } from "@/modules/dealers/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { PayDealerDebtModal } from "@/modules/dealers/components/PayDealerDebtModal";
import { buildDealerDetailHref, type DealerDetailSearchParams } from "./searchParamsHref";

const TAB_LABELS = {
  purchases: "Purchases",
  "udhaar-history": "Udhaar history",
} as const;
type Tab = keyof typeof TAB_LABELS;

// One dealer's full detail — balance, every purchase (Products or
// Grain, whichever this dealer is), and every manual Udhaar posting,
// split into "Purchases" / "Udhaar history" tabs rather than stacked
// one after another — same real ?tab= navigation pattern the customer
// detail page's own Purchase history/Grain/Udhaar to Shop tabs use.
// Not cached — a shopkeeper recording a purchase or payment right
// here expects this page to reflect it on the very next load, same
// reasoning as every other financial detail page in the app.
export default async function DealerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<DealerDetailSearchParams>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "udhaar-history" ? "udhaar-history" : "purchases";
  const [dealer, bankAccounts] = await Promise.all([getDealer(id), listBankAccounts()]);

  return (
    <div>
      <Link
        href={dealer.type === "GRAIN" ? "/dashboard/dealers?tab=grain" : "/dashboard/dealers?tab=products"}
        className="back-link"
      >
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Dealers
      </Link>

      <div className="page-head" style={{ marginTop: 16 }}>
        <div>
          <h1>{dealer.name}</h1>
          <p>
            {dealer.phone || "No phone"} · {dealer.type === "GRAIN" ? "Grain dealer" : "Products dealer"}
            {!dealer.isActive && " · Inactive"}
          </p>
        </div>
        {dealer.currentBalance > 0 && (
          <PayDealerDebtModal
            dealerId={dealer.id}
            dealerName={dealer.name}
            amountOwed={dealer.currentBalance}
            bankAccounts={bankAccounts}
            label="Pay dealer"
          />
        )}
      </div>

      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <div className="stat-card">
          <p className="stat-label">Total purchased</p>
          <p className="stat-value tone-primary">{formatMoney(dealer.totalPurchased)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total paid</p>
          <p className="stat-value">{formatMoney(dealer.totalPaid)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Currently owed</p>
          <p className={`stat-value${dealer.currentBalance > 0 ? " tone-consigned" : ""}`}>
            {formatMoney(dealer.currentBalance)}
          </p>
        </div>
      </div>

      <div className="tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Link key={t} className={`tab${tab === t ? " active" : ""}`} href={buildDealerDetailHref(id, { tab: t })}>
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      {tab === "purchases" ? (
        dealer.type === "PRODUCTS" ? (
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: "right" }}>Quantity</th>
                  <th style={{ textAlign: "right" }}>Cost</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Payment</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {dealer.purchases.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={6}>No purchases recorded yet.</td>
                  </tr>
                ) : (
                  dealer.purchases.map((p) => (
                    <tr key={p.id}>
                      <td>{p.productName}</td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {p.quantity}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {formatMoney(p.costPrice)}
                      </td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                        {formatMoney(p.amount)}
                      </td>
                      <td>
                        <span
                          className={`pay-badge ${
                            p.paymentMethod === "CASH"
                              ? "pay-cash"
                              : p.paymentMethod === "ACCOUNT"
                                ? "pay-account"
                                : "pay-credit"
                          }`}
                        >
                          {p.paymentMethod === "CREDIT" ? "Udhaar" : p.paymentMethod}
                        </span>
                      </td>
                      <td>{formatDate(p.purchaseDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: "right" }}>Quantity</th>
                  <th style={{ textAlign: "right" }}>Rate</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {dealer.grainBatches.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={5}>No grain purchased yet.</td>
                  </tr>
                ) : (
                  dealer.grainBatches.map((b) => (
                    <tr key={b.id}>
                      <td>{b.productName}</td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {b.quantity} {b.unitName}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {formatMoney(b.rate)}
                      </td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                        {formatMoney(b.amount)}
                      </td>
                      <td>{formatDate(b.receivedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Payment</th>
                <th>Date</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {dealer.transactions.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={5}>No Udhaar activity yet.</td>
                </tr>
              ) : (
                dealer.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className={`pay-badge ${t.direction === "OUT" ? "pay-credit" : "pay-cash"}`}>
                        {t.isDealerSale
                          ? t.direction === "IN"
                            ? "Sold to dealer (Udhaar)"
                            : "Dealer repaid"
                          : t.direction === "OUT"
                            ? "Owed to dealer"
                            : "Paid dealer"}
                      </span>
                    </td>
                    <td
                      className="num"
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color: t.direction === "OUT" ? "var(--consigned-600)" : "var(--primary-600)",
                      }}
                    >
                      {t.direction === "OUT" ? "+" : "−"}
                      {formatMoney(t.amount)}
                    </td>
                    <td>{t.paymentMethod === "CREDIT" ? "Udhaar" : t.paymentMethod}</td>
                    <td>{formatDate(t.transactionDate)}</td>
                    <td style={{ color: "var(--ink-muted)" }}>{t.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
