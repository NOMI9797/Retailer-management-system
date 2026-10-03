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
} from "./schema";

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

  const dealer = await db.dealer.create({
    data: {
      shopId,
      name: data.name,
      phone: data.phone,
      type: data.type,
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
      where: { shopId, type, isActive: includeInactive ? undefined : true },
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
  if (!existing) throw new Error("Dealer not found");

  const dealer = await db.dealer.update({ where: { id }, data });
  invalidateShopCache(ENTITY, shopId);
  return dealer;
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
      purchases: { include: { product: true }, orderBy: { purchaseDate: "desc" } },
      batches: { include: { product: { include: { unit: true } } }, orderBy: { receivedAt: "desc" } },
    },
  });
  if (!dealer) throw new Error("Dealer not found");

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

  return {
    id: dealer.id,
    name: dealer.name,
    phone: dealer.phone,
    type: dealer.type,
    isActive: dealer.isActive,
    currentBalance,
    totalPurchased,
    totalPaid,
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
        notes: t.notes,
      })),
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
  if (!dealer) throw new Error("Products dealer not found");

  const product = await db.product.findFirst({ where: { id: data.productId, shopId, stockKind: "SIMPLE" } });
  if (!product) throw new Error("Product not found");

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
  return { ...purchase, quantity: Number(purchase.quantity), costPrice: Number(purchase.costPrice) };
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
      include: { dealer: true, product: true },
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
  if (!dealer) throw new Error("Grain dealer not found");

  const product = await db.product.findFirst({ where: { id: data.productId, shopId, stockKind: "GRAIN" } });
  if (!product) throw new Error("Product not found");

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
  return { ...batch, quantityIn: Number(batch.quantityIn), rate: batch.rate !== null ? Number(batch.rate) : null };
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
    include: { dealer: true, product: { include: { unit: true } } },
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
  if (!dealer || !dealer.account) throw new Error("Dealer not found");

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

  const dealer = await db.dealer.findFirst({ where: { id: data.dealerId, shopId }, include: { account: true } });
  if (!dealer || !dealer.account) throw new Error("Dealer not found");

  const outstanding = Number(dealer.account.currentBalance);
  if (data.amount > outstanding + 0.01) {
    throw new Error(
      `This payment (Rs ${data.amount}) is more than what's actually owed to ${dealer.name} (Rs ${outstanding}) — a payment can't exceed what's owed.`
    );
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
}
