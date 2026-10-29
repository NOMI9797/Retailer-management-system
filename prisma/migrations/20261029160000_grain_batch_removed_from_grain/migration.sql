-- A shop batch taken out of the grain stock only (kept for the customer account / cash records)
ALTER TABLE "GrainBatch" ADD COLUMN "removedFromGrain" BOOLEAN NOT NULL DEFAULT false;
