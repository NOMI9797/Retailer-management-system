-- A grain loan return carries a slip/register reference instead of free notes.
ALTER TABLE "GrainLoanReturn" RENAME COLUMN "notes" TO "reference";
