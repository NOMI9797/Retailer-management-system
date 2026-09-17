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
  // "LOAN" for a tracked Udhar-style debt, "ON_ACCOUNT" for a Regular
  // account carrying a balance — the badge distinction the milestone
  // asks to preserve even in one combined list.
  kind: "LOAN" | "ON_ACCOUNT";
  balance: number;
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
};
