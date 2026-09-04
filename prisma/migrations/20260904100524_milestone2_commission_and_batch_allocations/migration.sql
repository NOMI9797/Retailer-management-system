-- AlterTable
ALTER TABLE "GrainBatch" ADD COLUMN     "commissionPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DailySaleItemBatch" (
    "id" TEXT NOT NULL,
    "dailySaleItemId" TEXT NOT NULL,
    "grainBatchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "DailySaleItemBatch_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DailySaleItemBatch" ADD CONSTRAINT "DailySaleItemBatch_dailySaleItemId_fkey" FOREIGN KEY ("dailySaleItemId") REFERENCES "DailySaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySaleItemBatch" ADD CONSTRAINT "DailySaleItemBatch_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
