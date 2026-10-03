-- Pooled grain stock tracking: a second, simpler money tracker for
-- GRAIN products alongside the existing per-batch GrainBatch system.
-- pooledStockQuantity/pooledStockValue treat every purchase and sale
-- as one combined running balance per product (no FIFO, no per-batch
-- cost) — see Product.pooledStockValue's schema comment for the full
-- semantics, including why it's allowed to go negative.

ALTER TABLE "Product" ADD COLUMN "pooledStockQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "pooledStockValue" DECIMAL(14,2) NOT NULL DEFAULT 0;
