-- Closed grain seasons: each grain's final profit or loss per season.
CREATE TABLE "GrainSeason" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moneyPaid" DECIMAL(14,2) NOT NULL,
    "moneyReceived" DECIMAL(14,2) NOT NULL,
    "result" DECIMAL(14,2) NOT NULL,
    "kgBought" DECIMAL(14,3) NOT NULL,
    "kgSold" DECIMAL(14,3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "GrainSeason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrainSeason_productId_seasonNumber_key" ON "GrainSeason"("productId", "seasonNumber");
CREATE INDEX "GrainSeason_shopId_productId_idx" ON "GrainSeason"("shopId", "productId");

ALTER TABLE "GrainSeason" ADD CONSTRAINT "GrainSeason_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrainSeason" ADD CONSTRAINT "GrainSeason_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
