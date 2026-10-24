-- CreateEnum
CREATE TYPE "GrainLoanDirection" AS ENUM ('SHOP_LENT', 'SHOP_BORROWED');

-- AlterTable
ALTER TABLE "GrainBatch" ADD COLUMN     "grainLoanId" TEXT,
ADD COLUMN     "grainLoanReturnId" TEXT;

-- AlterTable
ALTER TABLE "StockUdhaarEntry" ADD COLUMN     "linkedGrainLoanId" TEXT,
ADD COLUMN     "linkedGrainLoanReturnId" TEXT;

-- CreateTable
CREATE TABLE "GrainLoan" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT,
    "dealerId" TEXT,
    "direction" "GrainLoanDirection" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "loanDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrainLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrainLoanReturn" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "grainLoanId" TEXT NOT NULL,
    "quantityReturned" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quantityPaid" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod",
    "bankAccountId" TEXT,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrainLoanReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrainLoanDraw" (
    "id" TEXT NOT NULL,
    "grainBatchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "grainLoanId" TEXT,
    "grainLoanReturnId" TEXT,

    CONSTRAINT "GrainLoanDraw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrainBatch_grainLoanId_key" ON "GrainBatch"("grainLoanId");

-- CreateIndex
CREATE UNIQUE INDEX "GrainBatch_grainLoanReturnId_key" ON "GrainBatch"("grainLoanReturnId");

-- AddForeignKey
ALTER TABLE "GrainBatch" ADD CONSTRAINT "GrainBatch_grainLoanId_fkey" FOREIGN KEY ("grainLoanId") REFERENCES "GrainLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainBatch" ADD CONSTRAINT "GrainBatch_grainLoanReturnId_fkey" FOREIGN KEY ("grainLoanReturnId") REFERENCES "GrainLoanReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoan" ADD CONSTRAINT "GrainLoan_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoan" ADD CONSTRAINT "GrainLoan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoan" ADD CONSTRAINT "GrainLoan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoan" ADD CONSTRAINT "GrainLoan_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoanReturn" ADD CONSTRAINT "GrainLoanReturn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoanReturn" ADD CONSTRAINT "GrainLoanReturn_grainLoanId_fkey" FOREIGN KEY ("grainLoanId") REFERENCES "GrainLoan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoanReturn" ADD CONSTRAINT "GrainLoanReturn_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoanDraw" ADD CONSTRAINT "GrainLoanDraw_grainBatchId_fkey" FOREIGN KEY ("grainBatchId") REFERENCES "GrainBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoanDraw" ADD CONSTRAINT "GrainLoanDraw_grainLoanId_fkey" FOREIGN KEY ("grainLoanId") REFERENCES "GrainLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainLoanDraw" ADD CONSTRAINT "GrainLoanDraw_grainLoanReturnId_fkey" FOREIGN KEY ("grainLoanReturnId") REFERENCES "GrainLoanReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
