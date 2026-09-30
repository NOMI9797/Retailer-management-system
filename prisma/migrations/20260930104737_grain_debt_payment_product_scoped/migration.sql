-- Lets a payGrainDebt payment be attributed to a specific product, so
-- "money the shop owes customers" can be reported per grain product
-- instead of only as one shop-wide lump sum per customer.

-- AlterTable
ALTER TABLE "AccountTransaction" ADD COLUMN     "linkedProductId" TEXT;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_linkedProductId_fkey" FOREIGN KEY ("linkedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
