-- Advance stock at a customer's home as written in the register (display only)
CREATE TABLE "GrainAdvanceRegister" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kg" DECIMAL(14,3) NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrainAdvanceRegister_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrainAdvanceRegister_shopId_customerId_productId_key" ON "GrainAdvanceRegister"("shopId", "customerId", "productId");

ALTER TABLE "GrainAdvanceRegister" ADD CONSTRAINT "GrainAdvanceRegister_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrainAdvanceRegister" ADD CONSTRAINT "GrainAdvanceRegister_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GrainAdvanceRegister" ADD CONSTRAINT "GrainAdvanceRegister_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
