-- A sale line's share of the bill's discount.
ALTER TABLE "DailySaleItem" ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
