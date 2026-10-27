import Link from "next/link";
import { listReturns } from "@/modules/returns/actions";
import { DeleteReturnButton } from "@/modules/returns/components/DeleteReturnButton";
import { formatDate, formatMoney } from "@/lib/utils";

const METHOD_LABEL = { CASH: "Cash", ACCOUNT: "Bank", CREDIT: "Less owed to dealer" } as const;

// Returns: goods customers brought back (Sales returns) and goods the
// shop sent back to dealers (Purchase returns), newest first, each
// with how the money went and a delete that undoes it. New returns are
// recorded from New entry.
export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "purchase" ? "purchase" : "sales";
  const { sales, purchases } = await listReturns();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Returns</h1>
          <p>Goods brought back by customers, and goods sent back to dealers.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/dashboard/daily-sales/new?tab=purchase-return" className="btn btn-ghost">
            Purchase return
          </Link>
          <Link href="/dashboard/daily-sales/new?tab=sales-return" className="btn btn-primary">
            Sales return
          </Link>
        </div>
      </div>

      <div className="tabs">
        <Link className={`tab${tab === "sales" ? " active" : ""}`} href="/dashboard/returns">
          Sales returns ({sales.length})
        </Link>
        <Link className={`tab${tab === "purchase" ? " active" : ""}`} href="/dashboard/returns?tab=purchase">
          Purchase returns ({purchases.length})
        </Link>
      </div>

      <section className="panel">
        {tab === "sales" ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Returned by</th>
                <th>Items</th>
                <th style={{ textAlign: "right" }}>Worth</th>
                <th>Money back</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={6}>No sales returns yet.</td>
                </tr>
              ) : (
                sales.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.date)}</td>
                    <td>
                      <Link href={r.partyHref} className="name-link">
                        {r.partyName}
                      </Link>
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)" }}>Ref: {r.reference}</span>
                    </td>
                    <td>
                      {r.items.map((i, k) => (
                        <span key={k} style={{ display: "block", fontSize: 13 }}>
                          {i.productName}: {i.quantity} {i.unitName}
                        </span>
                      ))}
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatMoney(r.amount)}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {r.cashRefund > 0 && <span style={{ display: "block" }}>Cash {formatMoney(r.cashRefund)}</span>}
                      {r.accountRefund > 0 && (
                        <span style={{ display: "block" }}>
                          Bank {formatMoney(r.accountRefund)}
                          {r.bankAccountName ? ` (${r.bankAccountName})` : ""}
                        </span>
                      )}
                      {r.creditReduced > 0.004 && <span style={{ display: "block" }}>Off Udhaar {formatMoney(r.creditReduced)}</span>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <DeleteReturnButton kind="SALE" id={r.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Dealer</th>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>Worth</th>
                <th>Money back</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={6}>No purchase returns yet.</td>
                </tr>
              ) : (
                purchases.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.date)}</td>
                    <td>
                      <Link href={r.dealerHref} className="name-link">
                        {r.dealerName}
                      </Link>
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)" }}>Ref: {r.reference}</span>
                    </td>
                    <td>
                      {r.productName}: {r.quantity} {r.unitName}
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatMoney(r.amount)}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {METHOD_LABEL[r.refundMethod]}
                      {r.bankAccountName ? ` (${r.bankAccountName})` : ""}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <DeleteReturnButton kind="PURCHASE" id={r.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
