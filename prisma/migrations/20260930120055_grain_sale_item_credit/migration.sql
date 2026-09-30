-- Tracks a customer buying grain FROM the shop on Credit, per sale
-- item, with its own repayment ledger — the mirror of the shop's own
-- grain-purchase debt (getShopOwedForGrain/payGrainDebt).

-- AlterTable
ALTER TABLE "DailySaleItem" ADD COLUMN     "creditAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "GrainSaleCreditPayment" (
    "id" TEXT NOT NULL,
    "dailySaleItemId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "GrainSaleCreditPayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GrainSaleCreditPayment" ADD CONSTRAINT "GrainSaleCreditPayment_dailySaleItemId_fkey" FOREIGN KEY ("dailySaleItemId") REFERENCES "DailySaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
