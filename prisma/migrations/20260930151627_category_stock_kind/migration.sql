-- Splits Categories into Product (Simple) vs Grain, so the Settings
-- page can show two real sections and the product-form category
-- dropdown only ever offers a matching-kind category.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "stockKind" "StockKind" NOT NULL DEFAULT 'SIMPLE';

-- Backfill: a category that currently holds ONLY GRAIN products
-- becomes GRAIN; every other category (SIMPLE-only, mixed, or with no
-- products at all) stays at the SIMPLE default set above. A "mixed"
-- category (holding both kinds) is a pre-existing data inconsistency
-- this migration doesn't try to resolve automatically — it's left as
-- SIMPLE, and the affected products can be recategorized by hand
-- afterward if any exist.
UPDATE "Category" c
SET "stockKind" = 'GRAIN'
WHERE EXISTS (
  SELECT 1 FROM "Product" p WHERE p."categoryId" = c.id AND p."stockKind" = 'GRAIN'
)
AND NOT EXISTS (
  SELECT 1 FROM "Product" p WHERE p."categoryId" = c.id AND p."stockKind" = 'SIMPLE'
);
