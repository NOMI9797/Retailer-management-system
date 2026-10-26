-- A deleted customer is hidden, never removed (their history stays).
ALTER TABLE "Customer" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
