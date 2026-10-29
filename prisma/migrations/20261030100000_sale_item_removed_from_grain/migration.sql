-- A sale line taken out of the Grain section only (kept in the sale, receipt, account and cash flow)
ALTER TABLE "DailySaleItem" ADD COLUMN "removedFromGrain" BOOLEAN NOT NULL DEFAULT false;
