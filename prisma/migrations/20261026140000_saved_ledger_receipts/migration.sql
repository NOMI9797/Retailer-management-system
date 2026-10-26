-- Ledger receipts saved from a customer's ledger (Receipts → Ledger receipts).
CREATE TABLE "SavedLedgerReceipt" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "receiptNumber" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedLedgerReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedLedgerReceipt_shopId_receiptNumber_key" ON "SavedLedgerReceipt"("shopId", "receiptNumber");
CREATE INDEX "SavedLedgerReceipt_shopId_createdAt_idx" ON "SavedLedgerReceipt"("shopId", "createdAt");

ALTER TABLE "SavedLedgerReceipt" ADD CONSTRAINT "SavedLedgerReceipt_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SavedLedgerReceipt" ADD CONSTRAINT "SavedLedgerReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
