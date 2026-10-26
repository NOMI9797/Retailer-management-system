-- Unsettled deposit grain given back to the customer as it is (no rate, no money).
ALTER TABLE "GrainBatch" ADD COLUMN "quantityReturned" DECIMAL(14,3) NOT NULL DEFAULT 0;

CREATE TABLE "GrainDepositReturn" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "grainBatchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "fromShopStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrainDepositReturn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GrainDepositReturn_shopId_returnDate_idx" ON "GrainDepositReturn"("shopId", "returnDate");

ALTER TABLE "GrainDepositReturn" ADD CONSTRAINT "GrainDepositReturn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrainDepositReturn" ADD CONSTRAINT "GrainDepositReturn_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrainDepositReturn" ADD CONSTRAINT "GrainDepositReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrainDepositReturn" ADD CONSTRAINT "GrainDepositReturn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
