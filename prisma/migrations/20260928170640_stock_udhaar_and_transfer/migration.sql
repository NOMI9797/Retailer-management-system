-- Adds the Stock Management module's new state: GrainBatch.quantityTransferred
-- (a customer batch's settled-away ownership claim, separate from
-- physical quantitySold) and sourceBatchId (traceability from a
-- transfer-purchase-created shop-owned batch back to the customer
-- batch it drew from), plus the StockUdhaarEntry ledger tracking
-- outstanding stock obligations from unsettled sales.

-- AlterTable
ALTER TABLE "GrainBatch" ADD COLUMN     "quantityTransferred" DECIMAL(14,3) NOT NULL DEFAULT 0,
ADD COLUMN     "sourceBatchId" TEXT;

-- CreateTable
CREATE TABLE "StockUdhaarEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "grainBatchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "linkedSaleId" TEXT,
    "linkedTransferBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "StockUdhaarEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GrainBatch" ADD CONSTRAINT "GrainBatch_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "GrainBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockUdhaarEntry" ADD CONSTRAINT "StockUdhaarEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockUdhaarEntry" ADD CONSTRAINT "StockUdhaarEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockUdhaarEntry" ADD CONSTRAINT "StockUdhaarEntry_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockUdhaarEntry" ADD CONSTRAINT "StockUdhaarEntry_linkedSaleId_fkey" FOREIGN KEY ("linkedSaleId") REFERENCES "DailySale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
