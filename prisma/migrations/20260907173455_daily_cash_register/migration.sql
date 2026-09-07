-- CreateTable
CREATE TABLE "DailyCashRegister" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "expectedClosing" DECIMAL(14,2) NOT NULL,
    "actualClosing" DECIMAL(14,2),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "DailyCashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCashRegister_shopId_date_key" ON "DailyCashRegister"("shopId", "date");

-- AddForeignKey
ALTER TABLE "DailyCashRegister" ADD CONSTRAINT "DailyCashRegister_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
