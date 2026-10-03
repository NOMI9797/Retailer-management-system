import Link from "next/link";
import { getDealerBalances } from "@/modules/dealers/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney } from "@/lib/utils";
import { PayDealerDebtModal } from "@/modules/dealers/components/PayDealerDebtModal";

// Every dealer (Products or Grain) the shop still owes money to —
// the Shop (Udhaar) → Dealers Udhaar subtab's table, same layout as
// ShopUdhaarTable/ShopGrainUdhaarTable but scoped to dealer purchases
// instead of expenses/grain settlements. Only dealers with a positive
// balance show up here — same "no stray Rs 0 row" convention every
// other Udhaar list in the app already follows.
export async function ShopDealerUdhaarTable() {
  const [productsDealers, grainDealers, bankAccounts] = await Promise.all([
    getDealerBalances("PRODUCTS"),
    getDealerBalances("GRAIN"),
    listBankAccounts(),
  ]);

  const rows = [...productsDealers, ...grainDealers]
    .filter((d) => d.currentBalance > 0)
    .sort((a, b) => b.currentBalance - a.currentBalance);

  if (rows.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No outstanding Dealer Udhaar right now.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Dealer</th>
            <th>Type</th>
            <th>Phone</th>
            <th style={{ textAlign: "right" }}>Owed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((dealer) => (
            <tr key={dealer.id}>
              <td>
                <Link href={`/dashboard/dealers/${dealer.id}`} className="name-link">
                  {dealer.name}
                </Link>
              </td>
              <td>
                <span className={`pay-badge ${dealer.type === "GRAIN" ? "pay-account" : "pay-mixed"}`}>
                  {dealer.type === "GRAIN" ? "Grain" : "Products"}
                </span>
              </td>
              <td style={{ color: "var(--ink-muted)" }}>{dealer.phone || "—"}</td>
              <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--consigned-600)" }}>
                {formatMoney(dealer.currentBalance)}
              </td>
              <td style={{ textAlign: "right" }}>
                <PayDealerDebtModal
                  dealerId={dealer.id}
                  dealerName={dealer.name}
                  amountOwed={dealer.currentBalance}
                  bankAccounts={bankAccounts}
                  label="Mark as paid"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
