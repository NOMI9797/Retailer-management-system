import Link from "next/link";
import {
  getDealerBalances,
  getDealerUdhaarTotals,
} from "@/modules/dealers/actions";
import { formatMoney } from "@/lib/utils";
import { DeleteDealerButton } from "@/modules/dealers/components/DeleteDealerButton";

// Dealer → Accounts tab — every dealer's own running balance, both
// PRODUCTS and GRAIN together, same look as the Customers list page
// (stat cards + a plain table with a "View" button per row, rather
// than a Pay-debt action inline — that action lives on the dealer's
// own detail page, reached via View, same "detail page owns the
// write actions" split Customers already uses). Not cached — a
// shopkeeper recording a payment on a dealer's detail page expects
// this list to reflect it on the very next load.
export async function DealerAccountsSection() {
  const [productsDealers, grainDealers, udhaar] = await Promise.all([
    getDealerBalances("PRODUCTS"),
    getDealerBalances("GRAIN"),
    getDealerUdhaarTotals(),
  ]);

  const dealers = [...productsDealers, ...grainDealers].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <>
      {/* Udhaar both ways across every dealer, Products and Grain. */}
      <div
        className="stat-grid customers-stat-grid"
        style={{ marginBottom: 22 }}
      >
        <div className="stat-card">
          <p className="stat-label">
            {udhaar.netOwedBy === "SHOP"
              ? "Net — shop owes dealers"
              : udhaar.netOwedBy === "DEALERS"
                ? "Net — dealers owe shop"
                : "Net — settled"}
          </p>
          <p
            className={`stat-value${
              udhaar.netOwedBy === "SHOP"
                ? " tone-consigned"
                : udhaar.netOwedBy === "DEALERS"
                  ? " tone-primary"
                  : ""
            }`}
          >
            {formatMoney(udhaar.netAmount)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Shop owes dealers (total)</p>
          <p
            className={`stat-value${udhaar.shopOwes ? " tone-consigned" : ""}`}
          >
            {formatMoney(udhaar.shopOwes)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Dealers owe shop (total)</p>
          <p
            className={`stat-value${udhaar.dealersOwe ? " tone-primary" : ""}`}
          >
            {formatMoney(udhaar.dealersOwe)}
          </p>
        </div>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Name</th>
              <th style={{ width: "18%" }}>Phone</th>
              <th style={{ width: "16%" }}>Type</th>
              <th style={{ textAlign: "right" }}>Owed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dealers.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={5}>No dealers found.</td>
              </tr>
            ) : (
              dealers.map((dealer) => {
                const initial = dealer.name.charAt(0).toUpperCase();
                return (
                  <tr key={dealer.id}>
                    <td>
                      <div className="cust-cell">
                        <div className="cust-avatar">{initial}</div>
                        <span className="cust-name">
                          {dealer.name}
                          {!dealer.isActive && " (inactive)"}
                        </span>
                      </div>
                    </td>
                    <td className={dealer.phone ? undefined : "muted-dash"}>
                      {dealer.phone || "—"}
                    </td>
                    <td>
                      <span
                        className={`pay-badge ${dealer.type === "GRAIN" ? "pay-account" : "pay-mixed"}`}
                      >
                        {dealer.type === "GRAIN" ? "Grain" : "Products"}
                      </span>
                    </td>
                    <td
                      className="num"
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color:
                          dealer.currentBalance > 0
                            ? "var(--consigned-600)"
                            : "var(--ink)",
                      }}
                    >
                      {formatMoney(dealer.currentBalance)}
                    </td>
                    <td>
                      <div
                        className="row-actions"
                        style={{ justifyContent: "flex-end" }}
                      >
                        <Link
                          className="btn btn-ghost"
                          href={`/dashboard/dealers/${dealer.id}`}
                        >
                          View
                        </Link>
                        <DeleteDealerButton dealerId={dealer.id} name={dealer.name} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {dealers.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 20px",
              fontSize: 12,
              color: "var(--ink-muted)",
            }}
          >
            <span>
              {dealers.length} dealer{dealers.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
