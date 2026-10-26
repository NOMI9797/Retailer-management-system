import Link from "next/link";
import { getSavedLedgerReceipt } from "@/modules/ledger-receipt/actions";
import { buildLedgerReceiptEscPos } from "@/modules/printing/escpos";
import { RECEIPT_HEADER } from "@/modules/printing/receiptHeader";
import { SlipPreview } from "@/modules/printing/components/SlipPreview";
import { PrintLedgerReceiptButton } from "@/modules/ledger-receipt/components/PrintLedgerReceiptButton";
import { DeleteLedgerReceiptButton } from "@/modules/ledger-receipt/components/DeleteLedgerReceiptButton";
import { formatDate, formatTime, toLocalDateString } from "@/lib/utils";

// One saved ledger receipt, drawn exactly as the receipt printer would
// print it (same printer output, read back), with Print and Delete.
export default async function LedgerReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saved = await getSavedLedgerReceipt(id);
  const backHref = saved
    ? `/dashboard/receipts?tab=ledger&date=${toLocalDateString(saved.createdAt)}`
    : "/dashboard/receipts?tab=ledger";

  return (
    <div>
      <Link href={backHref} className="back-link">
        <svg
          className="icon"
          viewBox="0 0 24 24"
          style={{ width: 14, height: 14 }}
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Ledger receipts
      </Link>

      {!saved ? (
        <p style={{ marginTop: 24, color: "var(--ink-muted)" }}>
          This receipt could not be found.
        </p>
      ) : (
        <>
          <div className="page-head" style={{ marginTop: 16 }}>
            <div>
              <h1>Ledger receipt L-{saved.receiptNumber}</h1>
              <p>
                <Link
                  href={`/dashboard/customers/${saved.receipt.customer.id}`}
                >
                  {saved.receipt.customer.name}
                </Link>
                {" · "}
                {formatDate(saved.receipt.fromDate)} to{" "}
                {formatDate(saved.receipt.toDate)}
                {" · created "}
                {formatDate(saved.createdAt)} at {formatTime(saved.createdAt)}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PrintLedgerReceiptButton receipt={saved.receipt} />
              <DeleteLedgerReceiptButton id={saved.id} redirectTo={backHref} />
            </div>
          </div>

          <p
            style={{
              color: "var(--ink-muted)",
              fontSize: 13,
              margin: "0 0 16px",
              textAlign: "center",
            }}
          >
            How it prints on the 58 mm receipt printer:
          </p>
          <SlipPreview
            raw={buildLedgerReceiptEscPos(saved.receipt, RECEIPT_HEADER)}
          />
        </>
      )}
    </div>
  );
}
