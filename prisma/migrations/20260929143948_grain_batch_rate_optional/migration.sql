-- Makes GrainBatch.rate optional — a customer's store-for-later
-- deposit has no price yet (per the Stock Management spec, no price
-- is calculated at deposit time), and grain sold via Stock Udhaar
-- before it's ever settled with the depositing customer may not have
-- a rate either, until the shopkeeper supplies one at the moment of
-- that sale. A shop-owned batch (ordinary deposit, transfer-purchase,
-- or settle-now deposit) always keeps a real rate — this only affects
-- the nullability of the column, no existing data changes.

-- AlterTable
ALTER TABLE "GrainBatch" ALTER COLUMN "rate" DROP NOT NULL;
