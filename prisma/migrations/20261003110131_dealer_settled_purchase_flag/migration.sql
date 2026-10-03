-- Marks a DealerTransaction row as a Cash/Account purchase posted
-- purely for cash-accounting visibility (never touches
-- DealerAccount.currentBalance) — see the column's schema comment.

ALTER TABLE "DealerTransaction" ADD COLUMN "isSettledPurchase" BOOLEAN NOT NULL DEFAULT false;
