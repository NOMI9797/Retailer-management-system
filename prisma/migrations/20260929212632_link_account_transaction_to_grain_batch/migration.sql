-- Links an AccountTransaction to the GrainBatch it paid for (set only
-- by payCustomerForGrain, a real 1:1 relationship — one transfer-
-- purchase/settle-now call creates exactly one of each). Lets a
-- per-settlement view show that specific purchase's own paid/Udhaar
-- status and exact date, rather than only an aggregate figure.

-- AlterTable
ALTER TABLE "AccountTransaction" ADD COLUMN     "linkedGrainBatchId" TEXT;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_linkedGrainBatchId_fkey" FOREIGN KEY ("linkedGrainBatchId") REFERENCES "GrainBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
