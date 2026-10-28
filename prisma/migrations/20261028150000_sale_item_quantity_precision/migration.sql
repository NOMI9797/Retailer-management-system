-- A sale line sold by amount stores its worked-out quantity precisely
ALTER TABLE "DailySaleItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(16,6);
