-- A grain's own stock and value as written in the register (display only)
CREATE TABLE "GrainRegisterStock" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ownKg" DECIMAL(14,3) NOT NULL,
    "ownValue" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrainRegisterStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrainRegisterStock_shopId_productId_key" ON "GrainRegisterStock"("shopId", "productId");

ALTER TABLE "GrainRegisterStock" ADD CONSTRAINT "GrainRegisterStock_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrainRegisterStock" ADD CONSTRAINT "GrainRegisterStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
