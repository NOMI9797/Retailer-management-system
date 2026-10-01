import Link from "next/link";
import { listShopGrainUdhaar } from "@/modules/stock/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { PayGrainDebtModal } from "@/modules/stock/components/PayGrainDebtModal";

// Every grain settlement the shop bought on Credit and hasn't fully
// paid out yet, across every customer — the Shop (Udhaar) → Grain
// Udhaar subtab's table, same layout as ShopUdhaarTable (Daily/
// Monthly Udhaar) but scoped to grain settlements instead of
// expenses. See listShopGrainUdhaar for why "Remaining"/"Paid" are
// shared across every settlement row for the same customer+product —
// a repayment pays down that whole bucket, not one specific
// settlement.
export async function ShopGrainUdhaarTable({ productId }: { productId?: string } = {}) {
  const [rows, bankAccounts] = await Promise.all([listShopGrainUdhaar(productId), listBankAccounts()]);

  if (rows.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No outstanding Grain Udhaar right now.
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
                <PayGrainDebtModal
                  customerId={row.customerId}
                  productId={row.productId}
                  customerName={row.customerName}
                  amountOwed={row.remaining}
                  defaultAmount={Math.min(row.borrowed, row.remaining)}
                  label="Mark as paid"
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
