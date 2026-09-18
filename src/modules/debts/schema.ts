// Debts is pure aggregation over existing Customers/Accounts data —
// nothing here writes new rows (the actual write, recording a loan or
// repayment, lives in customers/schema.ts's recordAccountTransaction,
// shared with the Customer Accounts ledger view), so there's no
// create/update schema, just the shapes the aggregation queries return.

export type DebtRow = {
  customerAccountId: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  accountTypeName: string;
  // "LOAN" for a tracked Udhaar-style debt, "ON_ACCOUNT" for a Regular
  // account carrying a balance — the badge distinction the milestone
  // asks to preserve even in one combined list.
  kind: "LOAN" | "ON_ACCOUNT";
  // totalBorrowed (sum of every OUT posting ever made on this
  // account) and totalPaid (sum of every IN posting) are both
  // lifetime totals, not tied to any single loan — same simplified
  // whole-account approach as the overdue flag, since partial
  // repayments don't cleanly map back to one original loan (see the
  // milestone's explicit scope boundary). balance is always
  // totalBorrowed - totalPaid, kept here directly from
  // CustomerAccount.currentBalance rather than recomputed, so it can
  // never drift from what the rest of the app reads.
  balance: number;
  totalBorrowed: number;
  totalPaid: number;
  // The earliest unpaid transaction's date — "unpaid" here means the
  // simplified whole-account sense (see getDebtSummary's comment),
  // not a precise per-transaction allocation.
  debtSince: Date;
  daysSince: number;
  dueDate: Date | null;
  isOverdue: boolean;
};

export type DebtSummary = {
  totalLoans: number;
  totalOnAccount: number;
  grandTotal: number;
  debtorCount: number;
  overdueCount: number;
  // Lifetime sum of every repayment (IN posting) across every debtor
  // account currently shown on this page — a shopkeeper's "how much
  // has actually come back so far" figure, separate from the
  // outstanding totals above.
  totalPaidOverall: number;
};

// Which bucket a DebtRow/DebtSummary is scoped to. "REGULAR" =
// isLongTerm: false transactions only (Credit-sale accrual + manually
// recorded non-long-term loans/repayments) — the existing Udhaar
// behavior, unchanged. "LONG_TERM" = isLongTerm: true only — a
// deliberate cash loan with a chosen duration (see
// AccountTransaction.isLongTerm's schema comment). The two are
// completely isolated from each other, per the "separate totals, not
// combined" decision — a customer's overall CustomerAccount.balance
// still reflects both together, but this app-level split never mixes
// them in a report.
export type DebtBucket = "REGULAR" | "LONG_TERM";
