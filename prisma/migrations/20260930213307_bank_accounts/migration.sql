-- Bank Accounts: split the generic ACCOUNT payment method into
-- specific, shopkeeper-managed bank accounts with their own tracked
-- running balance. bankAccountId is nullable everywhere it's added —
-- every ACCOUNT row recorded before this feature existed has no bank
-- account to attribute it to, and is deliberately left unassigned
-- rather than backfilled to a guessed default (see BankAccount's
-- schema comment). Going forward, the Zod/action layer requires a
-- bankAccountId whenever paymentMethod = ACCOUNT.

CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankAccount_shopId_name_key" ON "BankAccount"("shopId", "name");

ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountTransaction" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailySalePayment" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "DailySalePayment" ADD CONSTRAINT "DailySalePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrainSaleCreditPayment" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "GrainSaleCreditPayment" ADD CONSTRAINT "GrainSaleCreditPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpensePayment" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
