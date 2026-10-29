-- Advance stock entries from the register turned into real at-home records
ALTER TABLE "GrainBatch" ADD COLUMN "fromRegister" BOOLEAN NOT NULL DEFAULT false;
