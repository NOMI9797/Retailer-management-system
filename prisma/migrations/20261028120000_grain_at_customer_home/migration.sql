-- Grain the shop bought that is still at the customer's home
ALTER TABLE "GrainBatch" ADD COLUMN     "homeCustomerId" TEXT,
ADD COLUMN     "quantityAtHome" DECIMAL(14,3) NOT NULL DEFAULT 0;

ALTER TABLE "DailySaleItemBatch" ADD COLUMN     "fromHome" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "GrainPickup" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "grainBatchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "pickupDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrainPickup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GrainPickup_shopId_pickupDate_idx" ON "GrainPickup"("shopId", "pickupDate");

ALTER TABLE "GrainBatch" ADD CONSTRAINT "GrainBatch_homeCustomerId_fkey" FOREIGN KEY ("homeCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrainPickup" ADD CONSTRAINT "GrainPickup_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrainPickup" ADD CONSTRAINT "GrainPickup_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
