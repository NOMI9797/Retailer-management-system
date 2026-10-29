-- A grain's opening position from the register, and new stock filling its opening Stock Udhaar
CREATE TABLE "GrainOpening" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "udhaarKg" DECIMAL(14,3) NOT NULL,
    "udhaarValue" DECIMAL(14,2) NOT NULL,
    "leftShopKg" DECIMAL(14,3) NOT NULL,
    "register" JSONB NOT NULL,

    CONSTRAINT "GrainOpening_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrainOpeningFill" (
    "id" TEXT NOT NULL,
    "grainOpeningId" TEXT NOT NULL,
    "grainBatchId" TEXT NOT NULL,
    "kg" DECIMAL(14,3) NOT NULL,
    "rate" DECIMAL(16,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrainOpeningFill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrainOpening_shopId_productId_key" ON "GrainOpening"("shopId", "productId");

ALTER TABLE "GrainOpening" ADD CONSTRAINT "GrainOpening_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrainOpening" ADD CONSTRAINT "GrainOpening_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrainOpeningFill" ADD CONSTRAINT "GrainOpeningFill_grainOpeningId_fkey" FOREIGN KEY ("grainOpeningId") REFERENCES "GrainOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrainOpeningFill" ADD CONSTRAINT "GrainOpeningFill_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
