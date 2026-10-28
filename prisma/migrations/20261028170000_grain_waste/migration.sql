-- Grain waste: grain gone to waste, its cost spread on the stock left
ALTER TABLE "GrainBatch" ADD COLUMN     "grainWasteId" TEXT,
ALTER COLUMN "rate" SET DATA TYPE DECIMAL(16,6);

CREATE TABLE "GrainWaste" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "wasteDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "kgBefore" DECIMAL(14,3) NOT NULL,
    "valueBefore" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrainWaste_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrainWasteDraw" (
    "id" TEXT NOT NULL,
    "grainWasteId" TEXT NOT NULL,
    "grainBatchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "GrainWasteDraw_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GrainWaste_shopId_productId_idx" ON "GrainWaste"("shopId", "productId");

CREATE UNIQUE INDEX "GrainBatch_grainWasteId_key" ON "GrainBatch"("grainWasteId");

ALTER TABLE "GrainBatch" ADD CONSTRAINT "GrainBatch_grainWasteId_fkey" FOREIGN KEY ("grainWasteId") REFERENCES "GrainWaste"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrainWaste" ADD CONSTRAINT "GrainWaste_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrainWaste" ADD CONSTRAINT "GrainWaste_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrainWasteDraw" ADD CONSTRAINT "GrainWasteDraw_grainWasteId_fkey" FOREIGN KEY ("grainWasteId") REFERENCES "GrainWaste"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrainWasteDraw" ADD CONSTRAINT "GrainWasteDraw_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
