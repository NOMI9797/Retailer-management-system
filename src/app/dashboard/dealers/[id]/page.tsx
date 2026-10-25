import Link from "next/link";
import { getDealer } from "@/modules/dealers/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { PayDealerDebtModal } from "@/modules/dealers/components/PayDealerDebtModal";
import {
  DealerUdhaarModal,
  ReceiveDealerPaymentModal,
} from "@/modules/dealers/components/DealerUdhaarModal";
import { listGrainLoans } from "@/modules/grain-loans/actions";
import { GrainLoansPanel } from "@/modules/grain-loans/components/GrainLoansPanel";
import { listProducts } from "@/modules/products/actions";
import {
  buildDealerDetailHref,
  type DealerDetailSearchParams,
} from "./searchParamsHref";

const TAB_LABELS = {
  purchases: "Purchases & sales",
  "udhaar-history": "Udhaar history",
  "grain-loans": "Grain loans",
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
  const tab: Tab =
    rawTab === "udhaar-history" || rawTab === "grain-loans" ? rawTab : "purchases";
  const [dealerResult, bankAccounts, loans, grainProducts] = await Promise.all([
    getDealer(id),
    listBankAccounts(),
    tab === "grain-loans" ? listGrainLoans({ dealerId: id }) : Promise.resolve([]),
    tab === "grain-loans"
      ? listProducts({ stockKind: "GRAIN", pageSize: 500 })
      : Promise.resolve({ products: [] }),
  ]);

  if (!dealerResult.success) {
    return <div>Dealer not found</div>;
  }
  const dealer = dealerResult.data as NonNullable<typeof dealerResult.data>;

  return (
    <div>
      <Link
        href={
          dealer.type === "GRAIN"
            ? "/dashboard/dealers?tab=grain"
            : "/dashboard/dealers?tab=products"
        }
        className="back-link"
      >
        <svg
          className="icon"
          viewBox="0 0 24 24"
          style={{ width: 14, height: 14 }}
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Dealers
      </Link>

      <div className="page-head" style={{ marginTop: 16 }}>
        <div>
          <h1>{dealer.name}</h1>
          <p>
            {dealer.phone || "No phone"} ·{" "}
            {dealer.type === "GRAIN" ? "Grain dealer" : "Products dealer"}
            {!dealer.isActive && " · Inactive"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <DealerUdhaarModal
            dealerId={dealer.id}
            dealerName={dealer.name}
            shopOwes={dealer.shopOwes}
            dealerOwes={dealer.dealerOwes}
            bankAccounts={bankAccounts}
          />
          {dealer.shopOwes > 0 && (
            <PayDealerDebtModal
              dealerId={dealer.id}
              dealerName={dealer.name}
              amountOwed={dealer.shopOwes}
              bankAccounts={bankAccounts}
              label="Pay dealer"
            />
          )}
        </div>
      </div>

      {/* Udhaar both ways (never netted per side), the net with who
          owes, then what's been bought from this dealer. */}
      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <div className="stat-card">
          <p className="stat-label">
            {dealer.shopOwes > dealer.dealerOwes + 0.01
              ? "Net — shop owes dealer"
              : dealer.dealerOwes > dealer.shopOwes + 0.01
                ? "Net — dealer owes shop"
                : "Net — settled"}
          </p>
          <p
            className={`stat-value${
              dealer.shopOwes > dealer.dealerOwes + 0.01
                ? " tone-consigned"
                : dealer.dealerOwes > dealer.shopOwes + 0.01
                  ? " tone-primary"
                  : ""
            }`}
          >
            {formatMoney(Math.abs(dealer.shopOwes - dealer.dealerOwes))}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Dealer owes shop</p>
          <p
            className={`stat-value${dealer.dealerOwes > 0 ? " tone-primary" : ""}`}
          >
            {formatMoney(dealer.dealerOwes)}
          </p>
          {dealer.dealerOwes > 0.01 && (
            <ReceiveDealerPaymentModal
              dealerId={dealer.id}
              dealerName={dealer.name}
              amountOwed={dealer.dealerOwes}
              bankAccounts={bankAccounts}
              className="btn btn-primary stat-card-action"
            />
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">Shop owes dealer</p>
          <p
            className={`stat-value${dealer.shopOwes > 0 ? " tone-consigned" : ""}`}
          >
            {formatMoney(dealer.shopOwes)}
          </p>
          {dealer.shopOwes > 0.01 && (
            <PayDealerDebtModal
              dealerId={dealer.id}
              dealerName={dealer.name}
              amountOwed={dealer.shopOwes}
              bankAccounts={bankAccounts}
              label="Pay now"
              className="btn btn-primary stat-card-action"
            />
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">Total purchased</p>
          <p className="stat-value">{formatMoney(dealer.totalPurchased)}</p>
        </div>
      </div>

      <div className="tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Link
            key={t}
            className={`tab${tab === t ? " active" : ""}`}
            href={buildDealerDetailHref(id, { tab: t })}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      {tab === "purchases" ? (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>By</th>
                <th>Product</th>
                <th style={{ textAlign: "right" }}>Quantity</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Payment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {dealer.trades.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={7}>
                    Nothing bought from or sold to this dealer yet.
                  </td>
                </tr>
              ) : (
                dealer.trades.map((t) => (
                  <tr key={t.id}>
                    {/* Who bought: the shop (from this dealer) or the
                        dealer (from the shop). */}
                    <td>
                      {t.by === "SHOP" ? (
                        <span className="pay-badge pay-account">Shop</span>
                      ) : (
                        <span className="pay-badge pay-mixed">Dealer</span>
                      )}
                    </td>
                    <td>
                      {t.productName}
                      <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                        {t.by === "SHOP"
                          ? "Shop bought from dealer"
                          : "Dealer bought from shop"}
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {t.quantity} {t.unitName}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {t.rate ? (
                        formatMoney(t.rate)
                      ) : (
                        <span className="dash">—</span>
                      )}
                    </td>
                    <td
                      className="num"
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color:
                          t.by === "SHOP"
                            ? "var(--consigned-600)"
                            : "var(--primary-600)",
                      }}
                    >
                      {formatMoney(t.amount)}
                    </td>
                    <td>
                      {t.payments.length === 0 ? (
                        <span className="dash">—</span>
                      ) : (
                        t.payments.map((p) => (
                          <span
                            key={p.method}
                            className={`pay-badge ${
                              p.method === "CASH"
                                ? "pay-cash"
                                : p.method === "ACCOUNT"
                                  ? "pay-account"
                                  : "pay-credit"
                            }`}
                            style={{ marginRight: 6 }}
                          >
                            {p.method === "CREDIT"
                              ? "Udhaar"
                              : p.method === "ACCOUNT"
                                ? "Bank"
                                : "Cash"}
                            {t.payments.length > 1 &&
                              `: ${formatMoney(p.amount)}`}
                          </span>
                        ))
                      )}
                    </td>
                    <td>{formatDate(t.date)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : tab === "grain-loans" ? (
        <GrainLoansPanel
          party={{ kind: "DEALER", id: dealer.id, name: dealer.name }}
          loans={loans}
          products={grainProducts.products.map((p) => ({ id: p.id, name: p.name }))}
          bankAccounts={bankAccounts}
        />
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>By</th>
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
                  <td colSpan={6}>No Udhaar activity yet.</td>
                </tr>
              ) : (
                dealer.transactions.map((t) => (
                  <tr key={t.id}>
                    {/* Who did it: the dealer (bought from the shop on
                        Udhaar, or paid it back) or the shop (bought from
                        the dealer on Udhaar, or paid them). Amber for the
                        shop, grey for the dealer — same as a customer's
                        Purchase history. */}
                    <td>
                      {t.isDealerSale ? (
                        <span className="pay-badge pay-mixed">Dealer</span>
                      ) : (
                        <span className="pay-badge pay-account">Shop</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`pay-badge ${t.direction === "OUT" ? "pay-credit" : "pay-cash"}`}
                      >
                        {t.isDealerSale
                          ? t.direction === "IN"
                            ? t.notes?.startsWith("Imported from register")
                              ? "Dealer owes shop (imported)"
                              : "Sold to dealer (Udhaar)"
                            : "Dealer repaid"
                          : t.direction === "OUT"
                            ? t.notes?.startsWith("Imported from register")
                              ? "Shop owes dealer (imported)"
                              : "Owed to dealer"
                            : "Paid dealer"}
                      </span>
                    </td>
                    <td
                      className="num"
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color:
                          t.direction === "OUT"
                            ? "var(--consigned-600)"
                            : "var(--primary-600)",
                      }}
                    >
                      {t.direction === "OUT" ? "+" : "−"}
                      {formatMoney(t.amount)}
                    </td>
                    <td>
                      {t.paymentMethod === "CREDIT"
                        ? "Udhaar"
                        : t.paymentMethod}
                    </td>
                    <td>{formatDate(t.transactionDate)}</td>
                    <td style={{ color: "var(--ink-muted)" }}>
                      {t.notes || "—"}
                      {t.reference && (
                        <div style={{ fontSize: 12 }}>Ref: {t.reference}</div>
                      )}
                    </td>
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
