import Link from "next/link";
import { listDebtors } from "@/modules/debts/actions";
import { formatMoney, formatDate, matchesSearch } from "@/lib/utils";
import { CustomerUdhaarPaymentModal } from "@/modules/customers/components/CustomerUdhaarPayment";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import type { DebtBucket } from "@/modules/debts/schema";

// Overdue first, then oldest debt first among the rest — listDebtors
// already returns rows in that order, so this table just renders them
// as-is. The overdue flag is a full tinted row + a bold warning chip,
// not a small badge lost among other columns, per the milestone's
// explicit "genuinely hard to miss" requirement. bucket scopes every
// figure to just Regular or just Long-term Udhaar (see
// DebtBucket's schema comment) — the two never mix on this table.
export async function DebtorTable({ bucket, search }: { bucket: DebtBucket; search?: string }) {
  const [allDebtors, bankAccounts] = await Promise.all([listDebtors(bucket), listBankAccounts()]);
  const debtors = allDebtors.filter((d) => matchesSearch(search, d.customerName, d.customerPhone, ...d.references));

  if (debtors.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          {search
            ? `No matches for "${search}".`
            : bucket === "LONG_TERM"
            ? "No outstanding long-term loans right now."
            : "No outstanding loans or on-account balances right now."}
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
            <th>Type</th>
            <th style={{ textAlign: "right" }}>Borrowed</th>
            <th style={{ textAlign: "right" }}>Paid</th>
            <th style={{ textAlign: "right" }}>Remaining</th>
            <th>Udhaar since</th>
            <th>Due date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {debtors.map((debtor) => (
            <tr key={debtor.customerAccountId} className={debtor.isOverdue ? "is-open" : undefined}>
              <td>
                <Link href={`/dashboard/customers/${debtor.customerId}`} className="name-link">
                  {debtor.customerName}
                </Link>
                {debtor.customerPhone && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                    {debtor.customerPhone}
                  </p>
                )}
                {debtor.references.length > 0 && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                    Ref: {debtor.references.join(", ")}
                  </p>
                )}
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
                {formatDate(debtor.debtSince)}
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                  {debtor.daysSince} day{debtor.daysSince === 1 ? "" : "s"} ago
                </p>
              </td>
              <td>
                {debtor.isOverdue ? (
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
                    Overdue{debtor.dueDate ? ` · ${formatDate(debtor.dueDate)}` : ""}
                  </span>
                ) : debtor.dueDate ? (
                  formatDate(debtor.dueDate)
                ) : (
                  <span className="dash">—</span>
                )}
              </td>
              <td style={{ textAlign: "right" }}>
                <CustomerUdhaarPaymentModal
                  customerId={debtor.customerId}
                  customerName={debtor.customerName}
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
