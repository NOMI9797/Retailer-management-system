import Link from "next/link";
import { getReceiptDetail } from "@/modules/daily-sales/actions";
import { formatMoney, formatDate, formatTime } from "@/lib/utils";
import { PrintReceiptButton } from "@/modules/printing/components/PrintReceiptButton";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Cash",
  ACCOUNT: "On account",
  CREDIT: "Udhaar",
};

// Full detail for one receipt — every item, the full payment split,
// buyer info. The natural place to eventually add a "Print" button
// once the printer bridge (see the saved project memory on QZ Tray)
// exists, since this already has every field a printed receipt needs.
export default async function ReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ dailySaleId: string }>;
  searchParams: Promise<{ visit?: string }>;
}) {
  const { dailySaleId } = await params;
  const { visit } = await searchParams;

  if (!visit) {
    return (
      <div>
        <Link href="/dashboard/receipts" className="back-link">
          <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Receipts
        </Link>
        <p style={{ marginTop: 24, color: "var(--ink-muted)" }}>No receipt specified.</p>
      </div>
    );
  }

  const visitAt = new Date(Number(visit));
  const receipt = await getReceiptDetail(dailySaleId, visitAt);

  return (
    <div>
      <Link href="/dashboard/receipts" className="back-link">
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Receipts
      </Link>

      {!receipt ? (
        <p style={{ marginTop: 24, color: "var(--ink-muted)" }}>This receipt could not be found.</p>
      ) : (
        <>
          <div className="page-head" style={{ marginTop: 16 }}>
            <div>
              <h1>Receipt #{receipt.receiptNumber}</h1>
              <p>
                {receipt.buyerName}
                {receipt.buyerKind === "DEALER" && (
                  <span className="pay-badge pay-mixed" style={{ marginLeft: 8 }}>
                    Dealer
                  </span>
                )}
                {" · "}
                {formatDate(receipt.visitAt)} at {formatTime(receipt.visitAt)}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <PrintReceiptButton receipt={receipt} variant="button" />
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: "right" }}>Quantity</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productName}</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {item.quantity} {item.unitName}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatMoney(item.actualPrice)}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatMoney(item.quantity * item.actualPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Payment</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {receipt.payments.map((p, i) => (
                  <tr key={i}>
                    <td>
                      {PAYMENT_LABEL[p.paymentMethod]}
                      {p.bankAccountName && ` — ${p.bankAccountName}`}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatMoney(p.amount)}
                    </td>
                  </tr>
                ))}
                {receipt.discount > 0.005 && (
                  <tr>
                    <td>Discount (bill {formatMoney(receipt.subtotal)})</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      − {formatMoney(receipt.discount)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ fontWeight: 600 }}>Total</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatMoney(receipt.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
