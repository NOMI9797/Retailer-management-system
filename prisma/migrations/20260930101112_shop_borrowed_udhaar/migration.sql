-- Marks an AccountTransaction as belonging to the Shop (Udhaar) bucket
-- — cash the shop itself borrows from a customer, isolated from every
-- other bucket sharing this table (see schema.prisma's comment).

-- AlterTable
ALTER TABLE "AccountTransaction" ADD COLUMN     "isShopBorrowed" BOOLEAN NOT NULL DEFAULT false;
