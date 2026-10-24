-- AlterTable
ALTER TABLE "Product" ADD COLUMN "tracksStock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DailySaleItem" ADD COLUMN "stockDeducted" DECIMAL(14,3);
