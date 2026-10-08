-- Add isDeleted soft-delete flag to the 4 entities whose referencing
-- foreign keys are required (NOT NULL), where a real DELETE would
-- either violate the constraint or orphan historical records.
ALTER TABLE "Dealer" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountType" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Unit" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Area never had an Active/Inactive concept before. Delete now
-- requires deactivation first, same rule every other Settings entity
-- follows, so Area needs isActive for the first time.
ALTER TABLE "Area" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
