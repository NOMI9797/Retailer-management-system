-- Waste beyond own stock comes out of customers' grain (more Stock Udhaar)
ALTER TABLE "GrainWaste" ADD COLUMN "fromCustomersKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
ADD COLUMN "customerRate" DECIMAL(16,6);
