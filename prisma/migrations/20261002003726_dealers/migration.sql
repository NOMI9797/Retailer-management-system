-- Dealers: a bulk supplier/buyer the shop does business with, fully
-- separate from Customer. Adds Dealer/DealerAccount/DealerTransaction
-- (mirroring Customer/CustomerAccount/AccountTransaction),
-- DealerProductPurchase (bulk Simple-stock purchases), GrainBatch's
-- optional dealerId (a grain batch can originate from a dealer
-- instead of a customer deposit), and DailySale's optional dealerId
-- alongside a now-optional customerId (a sale's counterparty is
-- either a customer or a dealer, never both).

CREATE TYPE "DealerType" AS ENUM ('PRODUCTS', 'GRAIN');

CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "type" "DealerType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dealer_shopId_name_key" ON "Dealer"("shopId", "name");

ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DealerAccount" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "DealerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealerAccount_dealerId_key" ON "DealerAccount"("dealerId");

ALTER TABLE "DealerAccount" ADD CONSTRAINT "DealerAccount_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DealerProductPurchase" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "bankAccountId" TEXT,
    "notes" TEXT,

    CONSTRAINT "DealerProductPurchase_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DealerProductPurchase" ADD CONSTRAINT "DealerProductPurchase_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerProductPurchase" ADD CONSTRAINT "DealerProductPurchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerProductPurchase" ADD CONSTRAINT "DealerProductPurchase_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GrainBatch: optional dealer source, alongside the existing
-- optional customer-depositor source.
ALTER TABLE "GrainBatch" ADD COLUMN "dealerId" TEXT;
ALTER TABLE "GrainBatch" ADD CONSTRAINT "GrainBatch_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DailySale: customerId becomes optional, dealerId added — a sale's
-- counterparty is either, never both (enforced at the app layer).
ALTER TABLE "DailySale" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "DailySale" ADD COLUMN "dealerId" TEXT;
ALTER TABLE "DailySale" ADD CONSTRAINT "DailySale_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DealerTransaction" (
    "id" TEXT NOT NULL,
    "dealerAccountId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" "TxnDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "linkedPurchaseId" TEXT,
    "isDealerSale" BOOLEAN NOT NULL DEFAULT false,
    "linkedSaleId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "bankAccountId" TEXT,
    "notes" TEXT,

    CONSTRAINT "DealerTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DealerTransaction" ADD CONSTRAINT "DealerTransaction_dealerAccountId_fkey" FOREIGN KEY ("dealerAccountId") REFERENCES "DealerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerTransaction" ADD CONSTRAINT "DealerTransaction_linkedPurchaseId_fkey" FOREIGN KEY ("linkedPurchaseId") REFERENCES "DealerProductPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerTransaction" ADD CONSTRAINT "DealerTransaction_linkedSaleId_fkey" FOREIGN KEY ("linkedSaleId") REFERENCES "DailySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerTransaction" ADD CONSTRAINT "DealerTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
