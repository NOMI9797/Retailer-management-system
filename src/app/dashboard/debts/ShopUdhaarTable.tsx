import { listShopExpenseUdhaar } from "@/modules/expenses/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { PayExpenseDebtModal } from "@/modules/expenses/components/PayExpenseDebtModal";

// Every still-unpaid Daily/Monthly expense — the Udhaar (Shop) tab's
// table, same layout as DebtorTable but scoped to expenses instead of
// customer accounts (there's no customer/due-date/overdue concept
// here, so those columns are dropped).
export async function ShopUdhaarTable() {
  const rows = await listShopExpenseUdhaar();

  if (rows.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No outstanding Daily/Monthly Udhaar right now.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Type</th>
            <th style={{ textAlign: "right" }}>Borrowed</th>
            <th style={{ textAlign: "right" }}>Paid</th>
            <th style={{ textAlign: "right" }}>Remaining</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.description}</td>
              <td>
                <span className={`pay-badge ${row.expenseType === "MONTHLY" ? "pay-account" : "pay-mixed"}`}>
                  {row.expenseType === "MONTHLY" ? "Monthly" : "Daily"}
                </span>
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
              <td>{formatDate(row.expenseDate)}</td>
              <td style={{ textAlign: "right" }}>
                <PayExpenseDebtModal expenseId={row.id} description={row.description} remaining={row.remaining} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
