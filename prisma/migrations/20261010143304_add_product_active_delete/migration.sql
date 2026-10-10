-- Product previously had no Active/Inactive concept at all. Delete
-- requires deactivation first (same two-step rule every other
-- Settings/catalog entity follows), then soft-deletes rather than a
-- real DELETE, since DailySaleItem.productId, DealerProductPurchase.productId,
-- GrainBatch.productId, and StockUdhaarEntry.productId are all
-- required (NOT NULL) foreign keys.
ALTER TABLE "Product" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
