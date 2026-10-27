-- Bank movements entered by hand: an imported opening balance, or cash withdrawn to the drawer.
CREATE TYPE "BankEntryKind" AS ENUM ('OPENING', 'WITHDRAW');

CREATE TABLE "BankEntry" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "kind" "BankEntryKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankEntry_shopId_entryDate_idx" ON "BankEntry"("shopId", "entryDate");

ALTER TABLE "BankEntry" ADD CONSTRAINT "BankEntry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankEntry" ADD CONSTRAINT "BankEntry_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
