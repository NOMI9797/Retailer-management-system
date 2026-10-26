-- Expense Udhaar payments carry a slip / register reference like every other payment.
ALTER TABLE "ExpensePayment" ADD COLUMN "reference" TEXT;
