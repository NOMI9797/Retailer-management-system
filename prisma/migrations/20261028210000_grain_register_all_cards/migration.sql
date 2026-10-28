-- Every Grain page card can carry its own register figure (display only)
ALTER TABLE "GrainRegisterStock" ALTER COLUMN "ownKg" DROP NOT NULL,
ALTER COLUMN "ownValue" DROP NOT NULL,
ADD COLUMN "customerKg" DECIMAL(14,3),
ADD COLUMN "physicalKg" DECIMAL(14,3),
ADD COLUMN "stockUdhaarKg" DECIMAL(14,3),
ADD COLUMN "pooledKg" DECIMAL(14,3),
ADD COLUMN "advanceKg" DECIMAL(14,3),
ADD COLUMN "borrowedKg" DECIMAL(14,3);
