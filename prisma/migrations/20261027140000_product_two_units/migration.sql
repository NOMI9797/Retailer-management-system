-- Products sold in two units (e.g. 1 Bag = 50 Kgs).
ALTER TABLE "Product" ADD COLUMN "subUnitId" TEXT;
ALTER TABLE "Product" ADD COLUMN "subUnitsPerUnit" DECIMAL(12,3);
ALTER TABLE "Product" ADD CONSTRAINT "Product_subUnitId_fkey" FOREIGN KEY ("subUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Finer stock precision so selling a few kg out of a bag never drifts.
ALTER TABLE "Product" ALTER COLUMN "quantity" TYPE DECIMAL(16,6);
ALTER TABLE "DailySaleItem" ALTER COLUMN "stockDeducted" TYPE DECIMAL(16,6);
-- The unit a sale line / dealer purchase was entered in.
ALTER TABLE "DailySaleItem" ADD COLUMN "unitName" TEXT;
ALTER TABLE "DealerProductPurchase" ADD COLUMN "unitName" TEXT;
ALTER TABLE "DealerProductPurchase" ADD COLUMN "stockQuantity" DECIMAL(16,6);
