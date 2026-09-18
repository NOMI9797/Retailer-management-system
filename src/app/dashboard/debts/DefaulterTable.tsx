import Link from "next/link";
import { listDefaulters } from "@/modules/debts/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { RecordAccountTransactionModal } from "@/modules/customers/components/RecordAccountTransactionModal";

// A consolidated view across BOTH buckets (Regular and Long-term) —
// every debtor whose oldest due-dated unpaid transaction is more than
// the grace period past due (see GRACE_PERIOD_DAYS in
// modules/debts/actions.ts). This is a read-only "who needs urgent
// attention" list layered on top; a defaulter still shows up normally
// on their own Regular or Long-term tab too — nothing is removed from
// there. Every row is overdue by construction, so unlike DebtorTable
// there's no non-overdue case to render — the whole table is the
// warning.
export async function DefaulterTable() {
  const defaulters = await listDefaulters();

  if (defaulters.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No defaulters right now — nobody is more than a week past their due date.
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
            <th>Loan type</th>
            <th>Type</th>
            <th style={{ textAlign: "right" }}>Borrowed</th>
            <th style={{ textAlign: "right" }}>Paid</th>
            <th style={{ textAlign: "right" }}>Remaining</th>
            <th>Due date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {defaulters.map((debtor) => (
            <tr key={`${debtor.bucket}-${debtor.customerAccountId}`} className="is-open">
              <td>
                <Link href={`/dashboard/customers/${debtor.customerId}`} className="name-link">
                  {debtor.customerName}
                </Link>
                {debtor.customerPhone && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                    {debtor.customerPhone}
                  </p>
                )}
              </td>
              <td>
                <span className={`pay-badge ${debtor.bucket === "LONG_TERM" ? "pay-account" : "pay-cash"}`}>
                  {debtor.bucket === "LONG_TERM" ? "Long-term" : "Regular / Daily"}
                </span>
              </td>
              <td>
                <span className={`pay-badge ${debtor.kind === "LOAN" ? "pay-account" : "pay-cash"}`}>
                  {debtor.kind === "LOAN" ? "Loan" : "On account"}
                </span>
              </td>
              <td className="num" style={{ textAlign: "right" }}>
                {formatMoney(debtor.totalBorrowed)}
              </td>
              <td className="num" style={{ textAlign: "right", color: "var(--primary-600)" }}>
                {formatMoney(debtor.totalPaid)}
              </td>
              <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                {formatMoney(debtor.balance)}
              </td>
              <td>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontWeight: 700,
                    color: "var(--consigned-600)",
                    background: "var(--consigned-50)",
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                  }}
                >
                  <svg className="icon" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}>
                    <path d="M12 9v4M12 17h.01M10.3 3.9L2.7 17.5A1.9 1.9 0 004.4 20.5h15.2a1.9 1.9 0 001.7-3L13.7 3.9a1.9 1.9 0 00-3.4 0z" />
                  </svg>
                  {debtor.dueDate ? formatDate(debtor.dueDate) : "—"}
                </span>
              </td>
              <td style={{ textAlign: "right" }}>
                <RecordAccountTransactionModal
                  customerAccountId={debtor.customerAccountId}
                  triggerLabel="Record repayment"
                  defaultDirection="IN"
                  lockBucket={debtor.bucket === "LONG_TERM"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
