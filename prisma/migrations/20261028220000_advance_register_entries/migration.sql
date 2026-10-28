-- Advance stock from the register becomes entries, each in a section
-- (Grain loans or Bought — at their home); existing figures go to HOME.
CREATE TYPE "AdvanceRegisterSection" AS ENUM ('LOAN', 'HOME');

DROP INDEX "GrainAdvanceRegister_shopId_customerId_productId_key";

ALTER TABLE "GrainAdvanceRegister" ADD COLUMN "section" "AdvanceRegisterSection" NOT NULL DEFAULT 'HOME',
ADD COLUMN "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "GrainAdvanceRegister_shopId_customerId_idx" ON "GrainAdvanceRegister"("shopId", "customerId");
