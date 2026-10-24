import Link from "next/link";
import { listShopGrainUdhaar } from "@/modules/stock/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate, matchesSearch } from "@/lib/utils";
import { ShopUdhaarPaymentModal } from "@/modules/customers/components/CustomerUdhaarPayment";

// Every grain settlement the shop bought on Credit and hasn't fully
// paid out yet, across every customer — the Shop (Udhaar) → Grain
// Udhaar subtab's table, same layout as ShopUdhaarTable (Daily/
// Monthly Udhaar) but scoped to grain settlements instead of
// expenses. Each row's Paid/Remaining is its own share of the shop's
// pooled repayments to that customer, spread oldest first (see
// listShopGrainUdhaar).
export async function ShopGrainUdhaarTable({ productId, search }: { productId?: string; search?: string } = {}) {
  const [allRows, bankAccounts] = await Promise.all([listShopGrainUdhaar(productId), listBankAccounts()]);
  const rows = allRows.filter((r) => matchesSearch(search, r.customerName));

  if (rows.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          {search ? `No matches for "${search}".` : "No outstanding Grain Udhaar right now."}
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Product</th>
            <th style={{ textAlign: "right" }}>Quantity</th>
            <th style={{ textAlign: "right" }}>Rate</th>
            <th style={{ textAlign: "right" }}>Borrowed</th>
            <th style={{ textAlign: "right" }}>Paid</th>
            <th style={{ textAlign: "right" }}>Remaining</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.transactionId}>
              <td>
                <Link href={`/dashboard/customers/${row.customerId}`} className="name-link">
                  {row.customerName}
                </Link>
              </td>
              <td>{row.productName}</td>
              <td className="num" style={{ textAlign: "right" }}>
                {row.quantity} {row.unitName}
              </td>
              <td className="num" style={{ textAlign: "right" }}>
                {formatMoney(row.rate)}
              </td>
              <td className="num" style={{ textAlign: "right" }}>
                {formatMoney(row.borrowed)}
              </td>
              <td className="num" style={{ textAlign: "right", color: "var(--primary-600)" }}>
                {formatMoney(row.paid)}
              </td>
              <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                {formatMoney(row.remaining)}
              </td>
              <td>{formatDate(row.date)}</td>
              <td style={{ textAlign: "right" }}>
                {/* The shop repays a customer one total, spread over
                    everything it owes them oldest first — not per row. */}
                <ShopUdhaarPaymentModal
                  customerId={row.customerId}
                  customerName={row.customerName}
                  bankAccounts={bankAccounts}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
