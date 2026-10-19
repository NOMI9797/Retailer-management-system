-- AlterTable
ALTER TABLE "AccountTransaction" ADD COLUMN "visitAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DealerTransaction" ADD COLUMN "visitAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StockUdhaarEntry" ADD COLUMN "visitAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "receiptNumber" INTEGER NOT NULL,
    "dailySaleId" TEXT NOT NULL,
    "visitAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_shopId_receiptNumber_key" ON "Receipt"("shopId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_dailySaleId_visitAt_key" ON "Receipt"("dailySaleId", "visitAt");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_dailySaleId_fkey" FOREIGN KEY ("dailySaleId") REFERENCES "DailySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
