"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { cashInHandRegisterSchema, type CashInHandRegisterInput } from "./schema";

// Cash in hand typed in from the register, or null when none is entered.
export async function getCashInHandRegister(): Promise<number | null> {
  const shopId = await getCurrentShopId();
  const row = await db.shopRegister.findUnique({ where: { shopId } });
  return row?.cashInHand != null ? Number(row.cashInHand) : null;
}

// Saves (or clears, with null) the register's Cash in hand — display
// only, no cash record changes.
export async function setCashInHandRegister(input: CashInHandRegisterInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = cashInHandRegisterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the amount");
  const cashInHand = parsed.data.amount;
  await db.shopRegister.upsert({
    where: { shopId },
    create: { shopId, cashInHand },
    update: { cashInHand },
  });
  return ok(null);
}
