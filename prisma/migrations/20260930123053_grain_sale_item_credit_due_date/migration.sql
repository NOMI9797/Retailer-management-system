-- When a customer's Udhaar for a specific grain sale item must be
-- paid back by, entered at sale time via a duration picker (same
-- pattern Long-term Udhaar/Shop-Borrowed loans already use).

-- AlterTable
ALTER TABLE "DailySaleItem" ADD COLUMN     "creditDueDate" DATE;
