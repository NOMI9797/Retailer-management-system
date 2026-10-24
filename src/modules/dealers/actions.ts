"use server";

import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { cachedShopQuery, invalidateShopCache } from "@/lib/cache";
import { parseLocalDateStart, parseLocalDateEnd } from "@/lib/utils";
import { postToBankAccount } from "@/modules/settings/bankAccounts.actions";
import { postToPooledGrainStock } from "@/modules/stock/actions";
import {
  dealerSchema,
  updateDealerSchema,
  dealerProductPurchaseSchema,
  dealerGrainPurchaseSchema,
  recordDealerDebtSchema,
  payDealerDebtSchema,
  type DealerInput,
  type UpdateDealerInput,
  type DealerProductPurchaseInput,
  type DealerGrainPurchaseInput,
  type RecordDealerDebtInput,
  type PayDealerDebtInput,
  importDealerUdhaarSchema,
  receiveDealerPaymentSchema,
  type ImportDealerUdhaarInput,
  type ReceiveDealerPaymentInput,
} from "./schema";

type Result<T> = { success: true; data: T } | { success: false; error: string };

const ENTITY = "dealers";
const DEFAULT_PAGE_SIZE = 50;

// A dealer always gets its own DealerAccount the moment it's created
// — unlike Customer (which only creates an Udhaar account on demand,
// the first time it's actually needed), a dealer's whole reason for
// existing in this module IS its running balance, so there's no
// "maybe never needed" case to defer for.
export async function createDealer(input: DealerInput) {
  const shopId = await getCurrentShopId();
  const data = dealerSchema.parse(input);
  if (data.areaId && !(await db.area.findFirst({ where: { id: data.areaId, shopId } }))) {
    throw new Error("Area not found");
  }

  const dealer = await db.dealer.create({
    data: {
      shopId,
      name: data.name,
      phone: data.phone,
      type: data.type,
      areaId: data.areaId ?? null,
      account: { create: {} },
    },
  });
  invalidateShopCache(ENTITY, shopId);
  return dealer;
}

// Dealers barely change day to day — same short cache as Category/
// Unit/Area/BankAccount. type optionally narrows to just PRODUCTS or
// GRAIN dealers, for the two separate picker contexts (a Daily Sale's
// dealer picker, a grain batch's dealer picker) that must never show
// the wrong kind.
export const listDealers = cache(async (options?: { type?: "PRODUCTS" | "GRAIN"; includeInactive?: boolean }) => {
  const shopId = await getCurrentShopId();
  const type = options?.type;
  const includeInactive = options?.includeInactive ?? false;

  return cachedShopQuery(ENTITY, shopId, [type ?? "ALL", includeInactive], () =>
    db.dealer.findMany({
      // isDeleted is never shown regardless of includeInactive — see
      // deleteDealer's comment.
      where: { shopId, type, isActive: includeInactive ? undefined : true, isDeleted: false },
      include: { area: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    })
  );
});

// Powers the Dealer (Shop Purchases) / Dealer (Grain Stock) overview
// pages — every dealer of the given type with its live Udhaar
// balance, serialized to a plain number. Not cached (like
// getBankAccountBalances): a balance must always be queried fresh.
export async function getDealerBalances(type: "PRODUCTS" | "GRAIN") {
  const shopId = await getCurrentShopId();

  const dealers = await db.dealer.findMany({
    where: { shopId, type },
    include: { account: true },
    orderBy: { name: "asc" },
  });

  return dealers.map((d) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    type: d.type,
    isActive: d.isActive,
    // Positive = shop owes dealer (see DealerAccount's schema
    // comment). account is always present — createDealer always
    // creates one in the same call — so this is never actually null
    // in practice, but the type stays safe regardless.
    currentBalance: d.account ? Number(d.account.currentBalance) : 0,
  }));
}

export async function updateDealer(input: UpdateDealerInput) {
  const shopId = await getCurrentShopId();
  const { id, ...data } = updateDealerSchema.parse(input);

  const existing = await db.dealer.findFirst({ where: { id, shopId } });
  if (!existing) return { success: false, error: "Dealer not found" };
  if (data.areaId && !(await db.area.findFirst({ where: { id: data.areaId, shopId } }))) {
    return { success: false, error: "Area not found" };
  }

  const dealer = await db.dealer.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return { success: true, data: dealer };
}

// Permanently removes a dealer — blocked whenever they have any
// purchase/Udhaar history: a non-zero Udhaar balance, any product
// purchase, grain batch, daily sale (dealer-sold-to-shop), or
// transaction. The shopkeeper must deactivate instead if this dealer
// just isn't supplying anymore, same "deactivate when there's real
// history" rule every other entity in this module follows.
// Soft-deletes a dealer — DealerProductPurchase.dealerId is a
// required foreign key, so a real DELETE would either violate it or
// orphan every historical purchase from this dealer; there is no safe
// hard-delete here even once nothing new is being bought from them.
// Requires the dealer be deactivated FIRST (same two-step rule every
// Settings entity now follows), then flips isDeleted instead of
// removing the row. Still blocked on a non-zero Udhaar balance
// specifically (unlike Category/Unit/AccountType) — that's real,
// unresolved money either owed to or by this dealer, not just a
// referential-integrity concern, and hiding the dealer would make it
// invisible without actually resolving it.
export async function deleteDealer(id: string): Promise<{ success: false; error: string } | { success: true; data: null }> {
  const shopId = await getCurrentShopId();

  const existing = await db.dealer.findFirst({
    where: { id, shopId },
    include: { account: true },
  });
  if (!existing) return { success: false, error: "Dealer not found" };
  if (existing.isActive) {
    return { success: false, error: "Deactivate this dealer first, then delete it." };
  }
  if (existing.account && Number(existing.account.currentBalance) !== 0) {
    return { success: false, error: "This dealer still has an outstanding Udhaar balance — settle it before deleting." };
  }

  await db.dealer.update({ where: { id }, data: { isDeleted: true } });
  invalidateShopCache(ENTITY, shopId);
  return { success: true, data: null };
}

// One dealer's full detail — balance, every product purchase, every
// manual Udhaar posting — powers the Dealer detail page. Not cached,
// same "always fresh" reasoning as getDealerBalances.
export async function getDealer(id: string) {
  const shopId = await getCurrentShopId();

  const dealer = await db.dealer.findFirst({
    where: { id, shopId },
    include: {
      account: { include: { transactions: { orderBy: { transactionDate: "desc" } } } },
      purchases: { include: { product: { include: { unit: true } } }, orderBy: { purchaseDate: "desc" } },
      batches: { include: { product: { include: { unit: true } } }, orderBy: { receivedAt: "desc" } },
      dailySales: { include: { items: { include: { product: { include: { unit: true } } } }, payments: true } },
    },
  });
  if (!dealer) return { success: false, error: "Dealer not found" };

  // Everything bought and sold with this dealer in one list (the detail
  // page's Purchases & sales tab): the shop buying from them (product
  // purchases or grain batches — "SHOP") and the shop selling to them
  // (sale items — "DEALER"). payments carries the full split, so a sale
  // paid part in cash and part on Udhaar shows both.
  type TradePayment = { method: "CASH" | "ACCOUNT" | "CREDIT"; amount: number };
  const accountTxns = dealer.account?.transactions ?? [];
  const trades: {
    id: string;
    date: Date;
    by: "SHOP" | "DEALER";
    productName: string;
    unitName: string;
    quantity: number;
    rate: number;
    amount: number;
    payments: TradePayment[];
  }[] = [
    ...dealer.purchases.map((p) => {
      const amount = Number(p.quantity) * Number(p.costPrice);
      return {
        id: p.id,
        date: p.purchaseDate,
        by: "SHOP" as const,
        productName: p.product.name,
        unitName: p.product.unit.name,
        quantity: Number(p.quantity),
        rate: Number(p.costPrice),
        amount,
        payments: [{ method: p.paymentMethod, amount }],
      };
    }),
    ...dealer.batches.map((b) => {
      const quantity = Number(b.quantityIn);
      const rate = b.rate !== null ? Number(b.rate) : 0;
      const amount = quantity * rate;
      // createDealerGrainPurchase posts its payment row in the same
      // transaction as the batch — matched by amount and time.
      const paymentRow = accountTxns.find(
        (t) =>
          t.direction === "OUT" &&
          !t.isDealerSale &&
          Math.abs(Number(t.amount) - amount) < 0.01 &&
          Math.abs(t.transactionDate.getTime() - b.receivedAt.getTime()) < 60_000
      );
      return {
        id: b.id,
        date: b.receivedAt,
        by: "SHOP" as const,
        productName: b.product.name,
        unitName: b.product.unit.name,
        quantity,
        rate,
        amount,
        payments: paymentRow ? [{ method: paymentRow.paymentMethod, amount }] : [],
      };
    }),
    // One row per sale visit (a sale's payment split is per visit, not
    // per item), listing every product in it.
    ...dealer.dailySales.flatMap((sale) => {
      const visitTimes = [...new Set(sale.items.map((i) => i.visitAt.getTime()))];
      return visitTimes.map((time) => {
        const items = sale.items.filter((i) => i.visitAt.getTime() === time);
        const amount = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.actualPrice), 0);
        return {
          id: `${sale.id}:${time}`,
          date: new Date(time),
          by: "DEALER" as const,
          productName: items.map((i) => i.product.name).join(", "),
          unitName: items.length === 1 ? items[0].product.unit.name : "",
          quantity: items.reduce((sum, i) => sum + Number(i.quantity), 0),
          rate: items.length === 1 ? Number(items[0].actualPrice) : 0,
          amount,
          payments: sale.payments
            .filter((p) => p.visitAt.getTime() === time)
            .map((p) => ({ method: p.paymentMethod, amount: Number(p.amount) })),
        };
      });
    }),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Only one of purchases (PRODUCTS dealer) / batches (GRAIN dealer)
  // is ever non-empty for a given dealer, per Dealer.type's "one or
  // the other, never both" rule — totalPurchased covers whichever
  // kind this dealer actually is.
  const totalPurchased =
    dealer.purchases.reduce((sum, p) => sum + Number(p.quantity) * Number(p.costPrice), 0) +
    dealer.batches.reduce((sum, b) => sum + Number(b.quantityIn) * (b.rate !== null ? Number(b.rate) : 0), 0);
  // A Cash/Account purchase is paid in full the moment it's recorded
  // and never posts a DealerTransaction at all (see
  // createDealerProductPurchase/createDealerGrainPurchase — only a
  // CREDIT purchase posts one, same "settled immediately, no ledger
  // entry" convention payCustomerForGrain uses elsewhere), so
  // "totalPaid" can't be read off the transaction log alone — it has
  // to be derived as purchased minus still-owed, which is always
  // correct by construction since currentBalance already nets every
  // Credit purchase against every later repayment.
  const currentBalance = dealer.account ? Number(dealer.account.currentBalance) : 0;
  const totalPaid = totalPurchased - Math.max(currentBalance, 0);
  // Udhaar both ways, kept apart (see dealerUdhaarSides).
  const { shopOwes, dealerOwes } = dealerUdhaarSides(dealer.account?.transactions ?? []);

  return {
    success: true,
    data: {
      id: dealer.id,
      name: dealer.name,
      phone: dealer.phone,
      type: dealer.type,
      isActive: dealer.isActive,
      currentBalance,
      totalPurchased,
      totalPaid,
      shopOwes,
      dealerOwes,
      trades,
      purchases: dealer.purchases.map((p) => ({
        id: p.id,
        productId: p.productId,
        productName: p.product.name,
        quantity: Number(p.quantity),
        costPrice: Number(p.costPrice),
        amount: Number(p.quantity) * Number(p.costPrice),
        purchaseDate: p.purchaseDate,
        paymentMethod: p.paymentMethod,
        notes: p.notes,
      })),
      grainBatches: dealer.batches.map((b) => ({
        id: b.id,
        productId: b.productId,
        productName: b.product.name,
        unitName: b.product.unit.name,
        quantity: Number(b.quantityIn),
        rate: b.rate !== null ? Number(b.rate) : 0,
        amount: Number(b.quantityIn) * (b.rate !== null ? Number(b.rate) : 0),
        receivedAt: b.receivedAt,
      })),
      // isSettledPurchase rows are excluded here — this table is Udhaar
      // activity specifically ("Owed to dealer" / "Paid dealer"), and a
      // Cash/Account purchase was never owed at all; it already shows up
      // in the Purchases/Grain batches table above with its own payment
      // method column. See isSettledPurchase's schema comment.
      transactions: (dealer.account?.transactions ?? [])
        .filter((t) => !t.isSettledPurchase)
        .map((t) => ({
          id: t.id,
          direction: t.direction,
          amount: Number(t.amount),
          paymentMethod: t.paymentMethod,
          transactionDate: t.transactionDate,
          isDealerSale: t.isDealerSale,
          reference: t.reference,
          notes: t.notes,
        })),
    },
  };
}

// Records a bulk Simple-stock purchase from a PRODUCTS-type dealer —
// bumps Product.quantity and overwrites Product.costPrice to this
// purchase's cost (per the "keep it simple, one blended cost"
// decision — see DealerProductPurchase's schema comment), and when
// paid on Credit, posts a DealerTransaction OUT (the shop's debt to
// this dealer grows) in the SAME transaction so the purchase record,
// the stock bump, and the Udhaar posting can never drift apart.
export async function createDealerProductPurchase(input: DealerProductPurchaseInput) {
  const shopId = await getCurrentShopId();
  const data = dealerProductPurchaseSchema.parse(input);

  const dealer = await db.dealer.findFirst({ where: { id: data.dealerId, shopId, type: "PRODUCTS" } });
  if (!dealer) return { success: false, error: "Products dealer not found" };

  const product = await db.product.findFirst({ where: { id: data.productId, shopId, stockKind: "SIMPLE" } });
  if (!product) return { success: false, error: "Product not found" };

  const purchaseDate = data.purchaseDate ? parseLocalDateStart(data.purchaseDate) : new Date();
  const amount = data.quantity * data.costPrice;

  const purchase = await db.$transaction(async (tx) => {
    const created = await tx.dealerProductPurchase.create({
      data: {
        dealerId: data.dealerId,
        productId: data.productId,
        quantity: data.quantity,
        costPrice: data.costPrice,
        purchaseDate,
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        notes: data.notes,
      },
    });

    await tx.product.update({
      where: { id: product.id },
      data: { quantity: { increment: data.quantity }, costPrice: data.costPrice },
    });

    if (data.paymentMethod === "CREDIT") {
      const account = await tx.dealerAccount.findUniqueOrThrow({ where: { dealerId: data.dealerId } });
      await tx.dealerTransaction.create({
        data: {
          dealerAccountId: account.id,
          direction: "OUT",
          amount,
          linkedPurchaseId: created.id,
          paymentMethod: "CREDIT",
          notes: `Purchased ${data.quantity} ${product.name} @ ${data.costPrice}`,
        },
      });
      // OUT here means the shop's debt to the dealer grows — see
      // DealerAccount's schema comment on its inverted-from-Customer
      // sign convention.
      await tx.dealerAccount.update({ where: { id: account.id }, data: { currentBalance: { increment: amount } } });
    } else {
      if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
        await postToBankAccount(tx, data.bankAccountId, -amount);
      }
      // Cash/Account purchase — settled immediately, no debt. Still
      // posted (isSettledPurchase: true, never touches currentBalance)
      // so Cash Flow has a real row to read for "money left the shop
      // today" — see the column's schema comment.
      const account = await tx.dealerAccount.findUniqueOrThrow({ where: { dealerId: data.dealerId } });
      await tx.dealerTransaction.create({
        data: {
          dealerAccountId: account.id,
          direction: "OUT",
          amount,
          linkedPurchaseId: created.id,
          paymentMethod: data.paymentMethod,
          bankAccountId: data.bankAccountId,
          isSettledPurchase: true,
          notes: `Purchased ${data.quantity} ${product.name} @ ${data.costPrice}`,
        },
      });
    }

    return created;
  });

  invalidateShopCache(ENTITY, shopId);
  return {
    success: true,
    data: { ...purchase, quantity: Number(purchase.quantity), costPrice: Number(purchase.costPrice) },
  };
}

// Reverses a product purchase entirely — the product's stock increment,
// the bank posting (if ACCOUNT), the linked DealerTransaction, and the
// dealer's own Udhaar balance (if CREDIT) — then removes both rows.
// Mirrors createDealerProductPurchase's own writes exactly, in
// reverse, since every purchase always creates exactly one linked
// DealerTransaction (via linkedPurchaseId) regardless of payment
// method (see that function's comment on why — Cash Flow needs a real
// row for "money left the shop today" even when nothing was borrowed).
export async function deleteDealerProductPurchase(id: string): Promise<Result<null>> {
  const shopId = await getCurrentShopId();

  const purchase = await db.dealerProductPurchase.findFirst({
    where: { id, dealer: { shopId } },
    include: { dealer: { include: { account: true } } },
  });
  if (!purchase) return { success: false, error: "Purchase not found" };

  const amount = Number(purchase.quantity) * Number(purchase.costPrice);

  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: purchase.productId },
      data: { quantity: { decrement: Number(purchase.quantity) } },
    });

    if (purchase.paymentMethod === "ACCOUNT" && purchase.bankAccountId) {
      // The original purchase paid OUT of the account (money leaving
      // the shop) — reversing it pays that money back IN.
      await postToBankAccount(tx, purchase.bankAccountId, amount);
    }

    if (purchase.paymentMethod === "CREDIT" && purchase.dealer.account) {
      // The shop's debt to the dealer grew by `amount` when this was
      // purchased on Credit (see createDealerProductPurchase) — undo
      // that growth.
      await tx.dealerAccount.update({
        where: { id: purchase.dealer.account.id },
        data: { currentBalance: { decrement: amount } },
      });
    }

    await tx.dealerTransaction.deleteMany({ where: { linkedPurchaseId: purchase.id } });
    await tx.dealerProductPurchase.delete({ where: { id: purchase.id } });
  });

  invalidateShopCache(ENTITY, shopId);
  return { success: true, data: null };
}

// Every Shop Purchase across every PRODUCTS dealer — the Dealer (Shop
// Purchases) page's own table, same shape as every other paginated
// list in the app.
export async function listDealerProductPurchases(options?: {
  dealerId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = {
    dealer: { shopId, type: "PRODUCTS" as const },
    dealerId: options?.dealerId || undefined,
    purchaseDate: {
      gte: options?.fromDate ? parseLocalDateStart(options.fromDate) : undefined,
      lte: options?.toDate ? parseLocalDateEnd(options.toDate) : undefined,
    },
  };

  const [purchases, totalCount] = await Promise.all([
    db.dealerProductPurchase.findMany({
      where,
      include: { dealer: true, product: { include: { unit: true } } },
      orderBy: { purchaseDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dealerProductPurchase.count({ where }),
  ]);

  return {
    purchases: purchases.map((p) => ({
      id: p.id,
      dealerId: p.dealerId,
      dealerName: p.dealer.name,
      productId: p.productId,
      productName: p.product.name,
      unitName: p.product.unit.name,
      quantity: Number(p.quantity),
      costPrice: Number(p.costPrice),
      amount: Number(p.quantity) * Number(p.costPrice),
      purchaseDate: p.purchaseDate,
      paymentMethod: p.paymentMethod,
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

// Stat-card totals for the Dealer (Shop Purchases) overview — total
// spent across every purchase ever recorded, total still owed
// (summed from every PRODUCTS dealer's live balance, only counting
// positive — shop-owes — balances, same "don't let an unrelated
// negative net against others" guard getBalanceSummary already
// applies to customer balances), and how many dealers are active.
export async function getDealerProductPurchaseSummary() {
  const shopId = await getCurrentShopId();

  const [purchases, dealers] = await Promise.all([
    db.dealerProductPurchase.findMany({ where: { dealer: { shopId, type: "PRODUCTS" } } }),
    db.dealer.findMany({ where: { shopId, type: "PRODUCTS", isActive: true }, include: { account: true } }),
  ]);

  const totalSpent = purchases.reduce((sum, p) => sum + Number(p.quantity) * Number(p.costPrice), 0);
  let totalOwed = 0;
  for (const d of dealers) {
    const balance = d.account ? Number(d.account.currentBalance) : 0;
    if (balance > 0) totalOwed += balance;
  }

  return {
    totalSpent,
    totalOwed,
    dealerCount: dealers.length,
    purchaseCount: purchases.length,
  };
}

// Records a bulk grain purchase from a GRAIN-type dealer — creates a
// new shop-owned GrainBatch tagged with dealerId (always a real,
// immediately-priced purchase, never a rate-less "store for later"
// deposit — see GrainBatch.dealerId's schema comment), flowing
// through the exact same FIFO/sale machinery every other shop-owned
// batch already uses. When paid on Credit, posts a DealerTransaction
// OUT (the shop's debt to this dealer grows) in the SAME transaction,
// same pattern createDealerProductPurchase already established.
export async function createDealerGrainPurchase(input: DealerGrainPurchaseInput) {
  const shopId = await getCurrentShopId();
  const data = dealerGrainPurchaseSchema.parse(input);

  const dealer = await db.dealer.findFirst({ where: { id: data.dealerId, shopId, type: "GRAIN" } });
  if (!dealer) return { success: false, error: "Grain dealer not found" };

  const product = await db.product.findFirst({ where: { id: data.productId, shopId, stockKind: "GRAIN" } });
  if (!product) return { success: false, error: "Product not found" };

  const amount = data.quantity * data.rate;

  const batch = await db.$transaction(async (tx) => {
    const created = await tx.grainBatch.create({
      data: {
        productId: data.productId,
        dealerId: data.dealerId,
        quantityIn: data.quantity,
        rate: data.rate,
      },
    });

    if (data.paymentMethod === "CREDIT") {
      const account = await tx.dealerAccount.findUniqueOrThrow({ where: { dealerId: data.dealerId } });
      await tx.dealerTransaction.create({
        data: {
          dealerAccountId: account.id,
          direction: "OUT",
          amount,
          paymentMethod: "CREDIT",
          notes: `Purchased ${data.quantity} ${product.name} @ ${data.rate}`,
        },
      });
      await tx.dealerAccount.update({ where: { id: account.id }, data: { currentBalance: { increment: amount } } });
    } else {
      if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
        await postToBankAccount(tx, data.bankAccountId, -amount);
      }
      // Cash/Account purchase — settled immediately, no debt. Still
      // posted (isSettledPurchase: true, never touches currentBalance)
      // so Cash Flow has a real row to read — see
      // createDealerProductPurchase's identical treatment above.
      const account = await tx.dealerAccount.findUniqueOrThrow({ where: { dealerId: data.dealerId } });
      await tx.dealerTransaction.create({
        data: {
          dealerAccountId: account.id,
          direction: "OUT",
          amount,
          paymentMethod: data.paymentMethod,
          bankAccountId: data.bankAccountId,
          isSettledPurchase: true,
          notes: `Purchased ${data.quantity} ${product.name} @ ${data.rate}`,
        },
      });
    }

    // Real, priced purchase from a dealer — pool gains what was paid.
    await postToPooledGrainStock(tx, data.productId, data.quantity, amount);

    return created;
  });

  invalidateShopCache(ENTITY, shopId);
  return {
    success: true,
    data: { ...batch, quantityIn: Number(batch.quantityIn), rate: batch.rate !== null ? Number(batch.rate) : null },
  };
}

// Every grain batch bought from GRAIN dealers, across every dealer —
// the Dealer (Grain Stock) page's own purchase history, same shape as
// listDealerProductPurchases.
export async function listDealerGrainBatches(options?: { dealerId?: string; productId?: string }) {
  const shopId = await getCurrentShopId();

  const batches = await db.grainBatch.findMany({
    where: {
      dealerId: options?.dealerId ? options.dealerId : { not: null },
      productId: options?.productId || undefined,
      dealer: { shopId },
    },
    include: { dealer: { include: { account: { include: { transactions: true } } } }, product: { include: { unit: true } } },
    orderBy: { receivedAt: "desc" },
  });

  return batches.map((b) => ({
    id: b.id,
    dealerId: b.dealerId!,
    dealerName: b.dealer!.name,
    productId: b.productId,
    productName: b.product.name,
    unitName: b.product.unit.name,
    quantity: Number(b.quantityIn),
    rate: b.rate !== null ? Number(b.rate) : 0,
    amount: Number(b.quantityIn) * (b.rate !== null ? Number(b.rate) : 0),
    receivedAt: b.receivedAt,
    // createDealerGrainPurchase posts its payment row in the same
    // transaction as the batch — matched by amount and time, since the
    // row carries no batch link. Null if it can't be found.
    paymentMethod:
      b.dealer?.account?.transactions.find(
        (t) =>
          t.direction === "OUT" &&
          Math.abs(Number(t.amount) - Number(b.quantityIn) * Number(b.rate ?? 0)) < 0.01 &&
          Math.abs(t.transactionDate.getTime() - b.receivedAt.getTime()) < 60_000
      )?.paymentMethod ?? null,
  }));
}

// Stat-card totals for the Dealer (Grain Stock) overview — same shape
// as getDealerProductPurchaseSummary, scoped to GRAIN dealers.
export async function getDealerGrainPurchaseSummary() {
  const shopId = await getCurrentShopId();

  const [batches, dealers] = await Promise.all([
    db.grainBatch.findMany({ where: { dealerId: { not: null }, dealer: { shopId, type: "GRAIN" } } }),
    db.dealer.findMany({ where: { shopId, type: "GRAIN", isActive: true }, include: { account: true } }),
  ]);

  const totalSpent = batches.reduce((sum, b) => sum + Number(b.quantityIn) * (b.rate !== null ? Number(b.rate) : 0), 0);
  let totalOwed = 0;
  for (const d of dealers) {
    const balance = d.account ? Number(d.account.currentBalance) : 0;
    if (balance > 0) totalOwed += balance;
  }

  return {
    totalSpent,
    totalOwed,
    dealerCount: dealers.length,
    purchaseCount: batches.length,
  };
}

// Records more owed to a dealer with no purchase behind it (an
// opening balance, a lump adjustment) — always CREDIT, since no real
// cash moves on this leg (see recordDealerDebtSchema's comment).
// currentBalance increments — see DealerAccount's schema comment on
// why OUT/growing-debt means increment here, same direction
// CustomerAccount uses for a loan given.
export async function recordDealerDebt(input: RecordDealerDebtInput) {
  const shopId = await getCurrentShopId();
  const data = recordDealerDebtSchema.parse(input);

  const dealer = await db.dealer.findFirst({ where: { id: data.dealerId, shopId }, include: { account: true } });
  if (!dealer || !dealer.account) return { success: false, error: "Dealer not found" };

  await db.$transaction(async (tx) => {
    await tx.dealerTransaction.create({
      data: {
        dealerAccountId: dealer.account!.id,
        direction: "OUT",
        amount: data.amount,
        paymentMethod: "CREDIT",
        notes: data.notes || null,
      },
    });
    await tx.dealerAccount.update({
      where: { id: dealer.account!.id },
      data: { currentBalance: { increment: data.amount } },
    });
  });
  return { success: true, data: undefined };
}

// Pays down what the shop owes a dealer — amount is capped at the
// dealer's own outstanding balance, never trusted from the client.
// Real cash leaves the shop here, so paying via Account debits that
// bank account (the opposite of a customer paying the SHOP, where
// Account credits it) — same convention payShopBorrowedLoan already
// uses for the shop repaying a customer.
export async function payDealerDebt(input: PayDealerDebtInput) {
  const shopId = await getCurrentShopId();
  const data = payDealerDebtSchema.parse(input);

  const dealer = await db.dealer.findFirst({
    where: { id: data.dealerId, shopId },
    include: { account: { include: { transactions: true } } },
  });
  if (!dealer || !dealer.account) return { success: false, error: "Dealer not found" };

  // Only what the SHOP owes this dealer — never netted against what
  // the dealer owes the shop (see dealerUdhaarSides).
  const outstanding = dealerUdhaarSides(dealer.account.transactions).shopOwes;
  if (data.amount > outstanding + 0.01) {
    return {
      success: false,
      error: `This payment (Rs ${data.amount}) is more than what's actually owed to ${dealer.name} (Rs ${outstanding}) — a payment can't exceed what's owed.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.dealerTransaction.create({
      data: {
        dealerAccountId: dealer.account!.id,
        direction: "IN",
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        notes: data.notes || null,
      },
    });
    await tx.dealerAccount.update({
      where: { id: dealer.account!.id },
      data: { currentBalance: { decrement: data.amount } },
    });
    if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
      await postToBankAccount(tx, data.bankAccountId, -data.amount);
    }
  });
  return { success: true, data: undefined };
}

// Reverses a dealer-debt repayment — the dealer's Udhaar balance (back
// up, since a repayment decremented it) and the bank posting (if
// ACCOUNT, a repayment took money OUT, so reversing brings it back
// IN), then removes the row. Only ever called on a genuine repayment
// row (isSettledPurchase: false) — a purchase's own DealerTransaction
// (isSettledPurchase: true, or a Credit purchase's debt-creating OUT
// row) is deleted as part of deleteDealerProductPurchase instead,
// never through this function.
export async function deleteDealerTransaction(id: string): Promise<Result<null>> {
  const shopId = await getCurrentShopId();

  const txn = await db.dealerTransaction.findFirst({
    where: { id, dealerAccount: { dealer: { shopId } }, isSettledPurchase: false },
  });
  if (!txn) return { success: false, error: "Transaction not found" };

  const amount = Number(txn.amount);

  await db.$transaction(async (tx) => {
    await tx.dealerAccount.update({
      where: { id: txn.dealerAccountId },
      data: {
        currentBalance: txn.direction === "IN" ? { increment: amount } : { decrement: amount },
      },
    });
    if (txn.paymentMethod === "ACCOUNT" && txn.bankAccountId) {
      await postToBankAccount(tx, txn.bankAccountId, txn.direction === "IN" ? amount : -amount);
    }
    await tx.dealerTransaction.delete({ where: { id } });
  });

  return { success: true, data: null };
}

// One row of the Dealer page's Records tabs — a sale to a dealer
// (Credit) or a purchase from one (Debit), in one shape.
export type DealerRecordRow = {
  id: string;
  date: Date;
  dealerId: string;
  dealerName: string;
  productName: string;
  quantity: number;
  unitName: string;
  rate: number;
  amount: number;
  // e.g. "Cash", "Bank", "Udhaar", "Part Udhaar", "Mixed".
  payment: string;
  paymentTone: "cash" | "account" | "credit" | "mixed";
};

const DEALER_METHOD: Record<string, { label: string; tone: DealerRecordRow["paymentTone"] }> = {
  CASH: { label: "Cash", tone: "cash" },
  ACCOUNT: { label: "Bank", tone: "account" },
  CREDIT: { label: "Udhaar", tone: "credit" },
};

// Everything the shop SOLD to dealers — the Credit side of the Dealer
// page's Products (stockKind SIMPLE) or Grain (GRAIN) tab. One row per
// sale item, newest first. Payment comes from that visit's payment
// split (a grain item's own Udhaar share when it has one).
export async function listDealerSales(stockKind: "SIMPLE" | "GRAIN"): Promise<DealerRecordRow[]> {
  const shopId = await getCurrentShopId();

  const items = await db.dailySaleItem.findMany({
    where: { product: { shopId, stockKind }, dailySale: { shopId, dealerId: { not: null } } },
    include: {
      product: { include: { unit: true } },
      dailySale: { include: { dealer: true, payments: true } },
    },
    orderBy: { visitAt: "desc" },
  });

  return items.map((item) => {
    const quantity = Number(item.quantity);
    const rate = Number(item.actualPrice);
    const amount = quantity * rate;
    const creditAmount = item.creditAmount !== null ? Number(item.creditAmount) : 0;
    const methods = [
      ...new Set(
        item.dailySale.payments
          .filter((p) => p.visitAt.getTime() === item.visitAt.getTime())
          .map((p) => p.paymentMethod)
      ),
    ];
    const pay =
      creditAmount > 0 && creditAmount >= amount - 0.01
        ? DEALER_METHOD.CREDIT
        : creditAmount > 0.01
          ? { label: "Part Udhaar", tone: "credit" as const }
          : methods.length === 1
            ? DEALER_METHOD[methods[0]]
            : // A split visit names every method it used, e.g. "Cash +
              // Udhaar" — flagged as Udhaar whenever part of it was.
              {
                label: methods.map((m) => DEALER_METHOD[m].label).join(" + "),
                tone: methods.includes("CREDIT") ? ("credit" as const) : ("mixed" as const),
              };
    return {
      id: item.id,
      date: item.visitAt,
      dealerId: item.dailySale.dealerId!,
      dealerName: item.dailySale.dealer?.name ?? "Dealer",
      productName: item.product.name,
      quantity,
      unitName: item.product.unit.name,
      rate,
      amount,
      payment: pay.label,
      paymentTone: pay.tone,
    };
  });
}

// One dealer's Udhaar, both ways and kept apart (never netted): the
// shop owes the dealer for Udhaar purchases (OUT on Credit — not a
// settled Cash/Account purchase — and imported "shop owes" balances)
// minus the shop's payments (IN); the dealer owes the shop for Udhaar
// sales to them and imported "dealer owes" balances (isDealerSale IN)
// minus what they've paid back (isDealerSale OUT). Each floored at 0.
function dealerUdhaarSides(
  transactions: { direction: "IN" | "OUT"; amount: unknown; isDealerSale: boolean; isSettledPurchase: boolean }[]
) {
  let purchaseSide = 0;
  let saleSide = 0;
  for (const t of transactions) {
    const amount = Number(t.amount);
    if (t.isDealerSale) {
      saleSide += t.direction === "IN" ? amount : -amount;
    } else if (t.direction === "OUT" && !t.isSettledPurchase) {
      purchaseSide += amount;
    } else if (t.direction === "IN") {
      purchaseSide -= amount;
    }
  }
  return { shopOwes: Math.max(0, purchaseSide), dealerOwes: Math.max(0, saleSide) };
}

// Udhaar both ways for one dealer type (the Dealer page's Products or
// Grain tab), kept apart rather than netted per dealer:
//   - Shop owes dealers: Udhaar purchases (OUT on Credit, not a
//     settled Cash/Account purchase) minus the shop's payments (IN),
//     ignoring dealer-sale rows.
//   - Dealers owe shop: Udhaar sales TO dealers (isDealerSale IN)
//     minus any reversals (isDealerSale OUT).
// Each dealer's side is floored at zero; net = dealers owe − shop owes.
// Omitting type covers every dealer (the Accounts tab's overall cards).
export async function getDealerUdhaarTotals(type?: "PRODUCTS" | "GRAIN") {
  const shopId = await getCurrentShopId();
  const dealers = await db.dealer.findMany({
    where: { shopId, type: type || undefined },
    include: { account: { include: { transactions: true } } },
  });

  let shopOwes = 0;
  let dealersOwe = 0;
  for (const dealer of dealers) {
    const sides = dealerUdhaarSides(dealer.account?.transactions ?? []);
    shopOwes += sides.shopOwes;
    dealersOwe += sides.dealerOwes;
  }

  const net = dealersOwe - shopOwes;
  return {
    shopOwes,
    dealersOwe,
    netAmount: Math.abs(net),
    netOwedBy: (net > 0.01 ? "DEALERS" : net < -0.01 ? "SHOP" : "SETTLED") as "DEALERS" | "SHOP" | "SETTLED",
  };
}

// Brings a dealer's old balance over from the paper register — either
// the shop owing the dealer (a purchase-side OUT, like recordDealerDebt)
// or the dealer owing the shop (a sale-side isDealerSale IN, like an
// Udhaar sale to them). Always CREDIT, so no cash or bank money moves.
// currentBalance moves the same way those postings already move it
// (positive = shop owes dealer).
export async function importDealerUdhaar(input: ImportDealerUdhaarInput) {
  const shopId = await getCurrentShopId();
  const data = importDealerUdhaarSchema.parse(input);

  const dealer = await db.dealer.findFirst({ where: { id: data.dealerId, shopId }, include: { account: true } });
  if (!dealer || !dealer.account) return { success: false as const, error: "Dealer not found" };

  const shopOwes = data.owedBy === "SHOP";
  await db.$transaction(async (tx) => {
    await tx.dealerTransaction.create({
      data: {
        dealerAccountId: dealer.account!.id,
        direction: shopOwes ? "OUT" : "IN",
        amount: data.amount,
        paymentMethod: "CREDIT",
        isDealerSale: !shopOwes,
        reference: data.reference,
        notes: `Imported from register${data.notes ? ` — ${data.notes}` : ""}`,
      },
    });
    await tx.dealerAccount.update({
      where: { id: dealer.account!.id },
      data: { currentBalance: shopOwes ? { increment: data.amount } : { decrement: data.amount } },
    });
  });
  return { success: true as const, data: undefined };
}

// A dealer paying the shop back for what they owe it — the sale-side
// mirror of payDealerDebt. Capped at what the dealer owes (sale side
// only). Posts isDealerSale OUT (the dealer's debt shrinks), moves
// currentBalance back up, and — via Account — money INTO the bank.
export async function receiveDealerPayment(input: ReceiveDealerPaymentInput) {
  const shopId = await getCurrentShopId();
  const data = receiveDealerPaymentSchema.parse(input);

  const dealer = await db.dealer.findFirst({
    where: { id: data.dealerId, shopId },
    include: { account: { include: { transactions: true } } },
  });
  if (!dealer || !dealer.account) return { success: false as const, error: "Dealer not found" };

  const owed = dealerUdhaarSides(dealer.account.transactions).dealerOwes;
  if (owed <= 0.01) return { success: false as const, error: `${dealer.name} doesn't owe the shop anything right now.` };
  if (data.amount > owed + 0.01) {
    return {
      success: false as const,
      error: `This payment (Rs ${data.amount}) is more than ${dealer.name} owes the shop (Rs ${owed}) — a payment can't exceed what's owed.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.dealerTransaction.create({
      data: {
        dealerAccountId: dealer.account!.id,
        direction: "OUT",
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        bankAccountId: data.paymentMethod === "ACCOUNT" ? data.bankAccountId : null,
        isDealerSale: true,
        notes: data.notes || "Received from dealer",
      },
    });
    await tx.dealerAccount.update({
      where: { id: dealer.account!.id },
      data: { currentBalance: { increment: data.amount } },
    });
    if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
      await postToBankAccount(tx, data.bankAccountId, data.amount);
    }
  });
  return { success: true as const, data: undefined };
}
