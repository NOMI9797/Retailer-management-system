import Link from "next/link";
import { listSavedLedgerReceipts } from "@/modules/ledger-receipt/actions";
import { DeleteLedgerReceiptButton } from "@/modules/ledger-receipt/components/DeleteLedgerReceiptButton";
import { formatDate, formatTime } from "@/lib/utils";

// The Receipts page's Ledger receipts tab: every ledger receipt created
// on the picked day, newest first, each opening its printed-slip view.
export async function LedgerReceiptsSection({ date }: { date: string }) {
  const receipts = await listSavedLedgerReceipts(date);
  return (
    <section className="panel">
      <table>
        <thead>
          <tr>
            <th>Receipt</th>
            <th>Customer</th>
            <th>Dates covered</th>
            <th style={{ textAlign: "right" }}>Entries</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {receipts.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={6}>
                No ledger receipts created this day. Make one from a
                customer&apos;s page or New entry → Ledger receipt.
              </td>
            </tr>
          ) : (
            receipts.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link
                    href={`/dashboard/receipts/ledger/${r.id}`}
                    className="name-link"
                  >
                    L-{r.receiptNumber}
                  </Link>
                </td>
                <td>
                  <Link
                    href={`/dashboard/customers/${r.customerId}`}
                    className="name-link"
                  >
                    {r.customerName}
                  </Link>
                </td>
                <td>
                  {formatDate(r.fromDate)} – {formatDate(r.toDate)}
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {r.entryCount}
                </td>
                <td>{formatTime(r.createdAt)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <Link
                    href={`/dashboard/receipts/ledger/${r.id}`}
                    className="btn btn-ghost"
                    style={{ padding: "4px 10px", fontSize: 12.5 }}
                  >
                    View
                  </Link>
                  <DeleteLedgerReceiptButton id={r.id} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
