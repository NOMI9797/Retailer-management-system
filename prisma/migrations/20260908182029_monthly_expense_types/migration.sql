-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('DAILY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "expenseType" "ExpenseType" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "monthlyExpenseTypeId" TEXT;

-- CreateTable
CREATE TABLE "MonthlyExpenseType" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MonthlyExpenseType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyExpenseType_shopId_name_key" ON "MonthlyExpenseType"("shopId", "name");

-- AddForeignKey
ALTER TABLE "MonthlyExpenseType" ADD CONSTRAINT "MonthlyExpenseType_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_monthlyExpenseTypeId_fkey" FOREIGN KEY ("monthlyExpenseTypeId") REFERENCES "MonthlyExpenseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
