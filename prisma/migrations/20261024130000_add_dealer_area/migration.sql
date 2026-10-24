-- AlterTable
ALTER TABLE "Dealer" ADD COLUMN "areaId" TEXT;

-- AddForeignKey
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
