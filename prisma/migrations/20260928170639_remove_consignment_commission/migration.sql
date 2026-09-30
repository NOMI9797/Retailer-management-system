-- Removes the consignment/commission system: it modeled selling a
-- farmer's grain to an outside buyer as an immediate commission-split
-- payout, which the Stock Management module replaces with an explicit
-- customer-purchase (transfer) flow plus a Stock Udhaar obligation
-- ledger for unsettled sales. Confirmed via codebase audit that
-- tracksQuantity/commissionPercent have no other consumers.

-- AlterTable
ALTER TABLE "AccountType" DROP COLUMN "tracksQuantity";

-- AlterTable
ALTER TABLE "GrainBatch" DROP COLUMN "commissionPercent";

-- AlterTable
ALTER TABLE "Shop" DROP COLUMN "commissionPercent";
