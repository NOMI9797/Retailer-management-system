-- Sales returns (against a bill) and purchase returns (against a dealer purchase).
ALTER TABLE "AccountTransaction" ADD COLUMN     "saleReturnId" TEXT;

ALTER TABLE "DealerTransaction" ADD COLUMN     "purchaseReturnId" TEXT,
ADD COLUMN     "saleReturnId" TEXT;

CREATE TABLE "SaleReturn" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "dailySaleId" TEXT NOT NULL,
    "visitAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "dealerId" TEXT,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "cashRefund" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "accountRefund" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bankAccountId" TEXT,
    "creditReduced" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleReturnItem" (
    "id" TEXT NOT NULL,
    "saleReturnId" TEXT NOT NULL,
    "dailySaleItemId" TEXT NOT NULL,
    "quantity" DECIMAL(16,6) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "stockReturned" DECIMAL(16,6),

    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleReturnBatch" (
    "id" TEXT NOT NULL,
    "saleReturnItemId" TEXT NOT NULL,
    "grainBatchId" TEXT NOT NULL,
    "quantity" DECIMAL(16,6) NOT NULL,

    CONSTRAINT "SaleReturnBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseReturn" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "grainBatchId" TEXT,
    "quantity" DECIMAL(16,6) NOT NULL,
    "stockRemoved" DECIMAL(16,6) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "refundMethod" "PaymentMethod" NOT NULL,
    "bankAccountId" TEXT,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SaleReturn_shopId_returnDate_idx" ON "SaleReturn"("shopId", "returnDate");

CREATE INDEX "PurchaseReturn_shopId_returnDate_idx" ON "PurchaseReturn"("shopId", "returnDate");

ALTER TABLE "DealerTransaction" ADD CONSTRAINT "DealerTransaction_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DealerTransaction" ADD CONSTRAINT "DealerTransaction_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_dailySaleId_fkey" FOREIGN KEY ("dailySaleId") REFERENCES "DailySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_dailySaleItemId_fkey" FOREIGN KEY ("dailySaleItemId") REFERENCES "DailySaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturnBatch" ADD CONSTRAINT "SaleReturnBatch_saleReturnItemId_fkey" FOREIGN KEY ("saleReturnItemId") REFERENCES "SaleReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturnBatch" ADD CONSTRAINT "SaleReturnBatch_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "DealerProductPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
