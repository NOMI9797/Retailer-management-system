-- Shop-wide figures from the register (display only), e.g. Cash in hand
CREATE TABLE "ShopRegister" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "cashInHand" DECIMAL(14,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopRegister_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopRegister_shopId_key" ON "ShopRegister"("shopId");

ALTER TABLE "ShopRegister" ADD CONSTRAINT "ShopRegister_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
