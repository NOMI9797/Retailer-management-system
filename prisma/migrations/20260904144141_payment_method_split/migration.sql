/*
  Warnings:

  - You are about to drop the column `cashOrAccount` on the `AccountTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `cashOrAccount` on the `DailySaleItem` table. All the data in the column will be lost.
  - You are about to drop the column `cashOrAccount` on the `Expense` table. All the data in the column will be lost.
  - Added the required column `paymentMethod` to the `AccountTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentMethod` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'ACCOUNT', 'CREDIT');

-- AlterTable
ALTER TABLE "AccountTransaction" DROP COLUMN "cashOrAccount",
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL;

-- AlterTable
ALTER TABLE "DailySaleItem" DROP COLUMN "cashOrAccount";

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "cashOrAccount",
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL;

-- DropEnum
DROP TYPE "CashOrAccount";

-- CreateTable
CREATE TABLE "DailySalePayment" (
    "id" TEXT NOT NULL,
    "dailySaleId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "DailySalePayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DailySalePayment" ADD CONSTRAINT "DailySalePayment_dailySaleId_fkey" FOREIGN KEY ("dailySaleId") REFERENCES "DailySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
