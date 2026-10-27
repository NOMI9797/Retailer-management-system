-- Slip / register reference on grain coming in (Add batch, drop-off, dealer purchase).
ALTER TABLE "GrainBatch" ADD COLUMN "reference" TEXT;
