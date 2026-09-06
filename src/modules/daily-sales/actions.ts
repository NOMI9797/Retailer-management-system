"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import {
  createDailySaleSchema,
  updateDailySaleSchema,
  type CreateDailySaleInput,
  type UpdateDailySaleInput,
  type DailySaleItemInput,
  type PaymentSplitInput,
} from "./schema";
import type { Prisma } from "@prisma/client";

const DEFAULT_PAGE_SIZE = 50;
const PAYMENT_SPLIT_EPSILON = 0.01; // guards against float rounding, not real mismatches

// The core "make this sale real" logic for the ITEMS side — decrement
// stock/batches, post consignment payouts. Completely independent of
// how the buyer pays (per the "farmer's payout is unaffected by the
// buyer's Cash/Account/Credit split" decision) — this only computes
// and returns the item total, which applyPaymentSplit then checks the
// payment split against. Shared by createDailySale and
// updateDailySale so there is exactly one implementation of the
// batch-depletion/commission math, never two copies that could drift
// out of sync.
async function applySaleItems(
  tx: Prisma.TransactionClient,
  shopId: string,
  saleId: string,
  items: DailySaleItemInput[],
  visitAt: Date
) {
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId } });
  let itemTotal = 0;

  for (const item of items) {
    const product = await tx.product.findFirst({ where: { id: item.productId, shopId } });
    if (!product) throw new Error("Product not found");

    const saleItem = await tx.dailySaleItem.create({
      data: {
        dailySaleId: saleId,
        productId: item.productId,
        quantity: item.quantity,
        actualPrice: item.actualPrice,
        visitAt,
      },
    });

    if (product.stockKind === "SIMPLE") {
      if (Number(product.quantity) < item.quantity) {
        throw new Error(`Not enough stock for ${product.name} (have ${product.quantity}, need ${item.quantity})`);
      }
      await tx.product.update({
        where: { id: product.id },
        data: { quantity: { decrement: item.quantity } },
      });
    } else {
      // Grain: deplete oldest-first across as many batches as
      // needed. Manual batch selection is out of scope this
      // milestone — always FIFO by receivedAt.
      const batches = await tx.grainBatch.findMany({
        where: { productId: product.id },
        orderBy: { receivedAt: "asc" },
      });

      let remaining = item.quantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const available = Number(batch.quantityIn) - Number(batch.quantitySold);
        if (available <= 0) continue;

        const takeFromBatch = Math.min(available, remaining);
        remaining -= takeFromBatch;

        await tx.grainBatch.update({
          where: { id: batch.id },
          data: { quantitySold: { increment: takeFromBatch } },
        });
        await tx.dailySaleItemBatch.create({
          data: { dailySaleItemId: saleItem.id, grainBatchId: batch.id, quantity: takeFromBatch },
        });

        if (batch.ownerCustomerId) {
          const commissionPercent = Number(batch.commissionPercent ?? shop.commissionPercent);
          const grossValue = takeFromBatch * Number(batch.rate);
          const farmerShare = grossValue * (1 - commissionPercent / 100);

          const consignmentType = await tx.accountType.findFirst({
            where: { shopId, tracksQuantity: true },
          });
          if (!consignmentType) {
            throw new Error("No consignment-style account type configured for this shop");
          }
          const farmerAccount = await tx.customerAccount.findFirst({
            where: { customerId: batch.ownerCustomerId, accountTypeId: consignmentType.id },
          });
          if (!farmerAccount) {
            throw new Error(
              "The batch owner has no consignment account — this should have been caught when the batch was created."
            );
          }

          // The farmer's payout is completely independent of how the
          // BUYER paid (cash/account/credit) — it's always posted the
          // same way, computed purely from the batch's rate and
          // commission. It's tagged CREDIT here because it's money
          // the shop owes the farmer that hasn't physically changed
          // hands yet, not because it relates to the buyer's split.
          await tx.accountTransaction.create({
            data: {
              customerAccountId: farmerAccount.id,
              direction: "OUT",
              amount: farmerShare,
              quantity: takeFromBatch,
              linkedSaleId: saleId,
              paymentMethod: "CREDIT",
              notes: `Consignment share for ${product.name} sale (commission ${commissionPercent}%)`,
            },
          });
          // Shop owes the farmer their share — negative balance per
          // the describeBalance() convention (positive = customer
          // owes shop, negative = shop owes customer).
          await tx.customerAccount.update({
            where: { id: farmerAccount.id },
            data: { currentBalance: { decrement: farmerShare } },
          });
        }
      }

      if (remaining > 0) {
        throw new Error(`Not enough grain stock for ${product.name} (short by ${remaining})`);
      }
    }

    itemTotal += item.actualPrice * item.quantity;
  }

  return itemTotal;
}

// The BUYER side: validates the Cash/Account/Credit split sums to the
// bill total and records one DailySalePayment row per method actually
// used. Account types (Regular/Udhar/Consignment/...) are purely
// static labels for categorizing a customer — for now, NO payment
// method or balance is ever linked to a CustomerAccount/
// AccountTransaction here, Credit included. This split exists only
// for the sale's own record (and future Cash Flow reconciliation in
// Milestone 3); it does not touch any account's ledger.
async function applyPaymentSplit(
  tx: Prisma.TransactionClient,
  saleId: string,
  itemTotal: number,
  payments: PaymentSplitInput,
  visitAt: Date
) {
  const splitTotal = payments.cash + payments.account + payments.credit;
  if (Math.abs(splitTotal - itemTotal) > PAYMENT_SPLIT_EPSILON) {
    throw new Error(
      `Payment split (${splitTotal}) doesn't match the bill total (${itemTotal}) — cash + account + credit must add up exactly.`
    );
  }

  if (payments.cash > 0) {
    await tx.dailySalePayment.create({
      data: { dailySaleId: saleId, paymentMethod: "CASH", amount: payments.cash, visitAt },
    });
  }
  if (payments.account > 0) {
    await tx.dailySalePayment.create({
      data: { dailySaleId: saleId, paymentMethod: "ACCOUNT", amount: payments.account, visitAt },
    });
  }
  if (payments.credit > 0) {
    await tx.dailySalePayment.create({
      data: { dailySaleId: saleId, paymentMethod: "CREDIT", amount: payments.credit, visitAt },
    });
  }
}

// Completely undoes a sale's effects: restores simple stock and
// grain batch quantities, reverses every AccountTransaction linked to
// it (only ever the consignment/farmer payouts — the buyer's payment
// split never posts one, see applyPaymentSplit) with an exact
// opposite adjustment to each account's currentBalance, then deletes
// the batch allocations, sale items, payments, and transactions.
// Deliberately does NOT delete the DailySale row itself — that's what
// lets updateDailySale reuse the same id after reapplying, rather
// than the edit silently creating a new sale with a different id.
// deleteDailySale calls this and then removes the row as its own
// final step.
async function reverseSaleContents(tx: Prisma.TransactionClient, shopId: string, saleId: string) {
  const sale = await tx.dailySale.findFirst({
    where: { id: saleId, shopId },
    include: { items: { include: { batchAllocations: true } } },
  });
  if (!sale) throw new Error("Sale not found");

  for (const item of sale.items) {
    const product = await tx.product.findFirst({ where: { id: item.productId } });
    if (!product) continue; // product may have been deleted since; nothing to restore it to

    if (product.stockKind === "SIMPLE") {
      await tx.product.update({
        where: { id: product.id },
        data: { quantity: { increment: item.quantity } },
      });
    } else {
      for (const allocation of item.batchAllocations) {
        await tx.grainBatch.update({
          where: { id: allocation.grainBatchId },
          data: { quantitySold: { decrement: allocation.quantity } },
        });
      }
    }
  }

  // Reverse every ledger posting this sale made — both the
  // consignment payouts and the buyer's credit charge carry the same
  // linkedSaleId, so this one query catches both sides.
  const transactions = await tx.accountTransaction.findMany({ where: { linkedSaleId: saleId } });
  for (const txn of transactions) {
    // Currently only ever consignment/farmer payouts (direction OUT,
    // which had decremented the farmer's balance) — the buyer's
    // payment split never posts a transaction. Reversing means
    // applying the opposite of whatever direction it was.
    const amount = Number(txn.amount);
    await tx.customerAccount.update({
      where: { id: txn.customerAccountId },
      data: {
        currentBalance: txn.direction === "OUT" ? { increment: amount } : { decrement: amount },
      },
    });
  }
  await tx.accountTransaction.deleteMany({ where: { linkedSaleId: saleId } });
  await tx.dailySalePayment.deleteMany({ where: { dailySaleId: saleId } });

  const itemIds = sale.items.map((i) => i.id);
  await tx.dailySaleItemBatch.deleteMany({ where: { dailySaleItemId: { in: itemIds } } });
  await tx.dailySaleItem.deleteMany({ where: { dailySaleId: saleId } });

  return { customerId: sale.customerId, season: sale.season };
}

// A customer buying again later the same day joins their existing
// DailySale row for that date instead of getting a second one — per
// the "one record per customer per day" rule: Sales history then
// shows one combined row (total items, total amount) rather than
// duplicate-looking entries for the same customer/date, while the
// Purchase History panel still lists every item bought. "Same day"
// is calendar-day in the server's local time, matching how saleDate
// is displayed everywhere else (toLocaleDateString()).
async function findTodaysSale(tx: Prisma.TransactionClient, shopId: string, customerId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return tx.dailySale.findFirst({
    where: { shopId, customerId, saleDate: { gte: startOfDay, lte: endOfDay } },
  });
}

// The one transaction that makes a sale real, start to finish. Must
// not partially apply — a failure anywhere (insufficient stock, a
// mismatched payment split, a missing consignment account) rolls
// back everything: the DailySale row (or the items/payments just
// appended to today's existing one), every stock/batch decrement,
// and every ledger posting.
export async function createDailySale(input: CreateDailySaleInput) {
  const shopId = await getCurrentShopId();
  const data = createDailySaleSchema.parse(input);

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, shopId } });
    if (!customer) throw new Error("Customer not found");

    const existingSale = await findTodaysSale(tx, shopId, data.customerId);
    const sale =
      existingSale ??
      (await tx.dailySale.create({
        data: { shopId, customerId: data.customerId, season: data.season },
      }));

    // Only this purchase's own items count toward the payment split
    // check — a returning customer's new items/payments are appended
    // on top of whatever was already recorded for today, not merged
    // into one combined split (per the "add a new split for just the
    // new items" decision). A single visitAt, shared by every item and
    // payment this call writes, is what lets the UI later regroup a
    // merged day's DailySale back into "visit 1", "visit 2", etc.
    const visitAt = new Date();
    const itemTotal = await applySaleItems(tx, shopId, sale.id, data.items, visitAt);
    await applyPaymentSplit(tx, sale.id, itemTotal, data.payments, visitAt);

    const created = await tx.dailySale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { items: true },
    });

    // items[].quantity/actualPrice are Prisma Decimals — must be
    // plain numbers before this crosses into the Client Component
    // that calls createDailySale (NewSaleForm's onSaved).
    return {
      ...created,
      items: created.items.map(serializeDecimals),
    };
  });
}

// Edits a past sale by fully reversing its original effects and
// reapplying it as if it were brand new, with the edited item list
// and payment split — per the "reverse-then-reapply, not a parallel
// diff implementation" decision: correctness matters more than a
// surgical delta here, since this reuses applySaleItems/
// applyPaymentSplit exactly, the same code path createDailySale uses.
// Reuses the SAME DailySale.id throughout (see reverseSaleContents)
// rather than creating a new row, so the sale's identity doesn't
// silently change from editing it. A failure at any point (including
// the reapply step) rolls back the ENTIRE transaction, so a bad edit
// leaves the original sale completely untouched rather than partially
// reversed.
export async function updateDailySale(input: UpdateDailySaleInput) {
  const shopId = await getCurrentShopId();
  const data = updateDailySaleSchema.parse(input);

  return db.$transaction(async (tx) => {
    await reverseSaleContents(tx, shopId, data.saleId);

    // The edited items/payments are written as a single fresh visit —
    // editing a sale collapses whatever visit structure it had before
    // into the one edited version, which matches how the edit form
    // presents it (one combined item list, one combined split).
    const visitAt = new Date();
    const itemTotal = await applySaleItems(tx, shopId, data.saleId, data.items, visitAt);
    await applyPaymentSplit(tx, data.saleId, itemTotal, data.payments, visitAt);

    const updated = await tx.dailySale.findUniqueOrThrow({
      where: { id: data.saleId },
      include: { items: true },
    });

    return {
      ...updated,
      items: updated.items.map(serializeDecimals),
    };
  });
}

// Deletes a past sale entirely — reverses every stock/batch/ledger
// effect it caused, then removes the DailySale row itself (the one
// place that final delete happens — see reverseSaleContents). Same
// guarantee as updateDailySale: any failure rolls back the whole
// thing, so a sale is never left half-deleted.
export async function deleteDailySale(saleId: string) {
  const shopId = await getCurrentShopId();

  await db.$transaction(async (tx) => {
    await reverseSaleContents(tx, shopId, saleId);
    await tx.dailySale.delete({ where: { id: saleId } });
  });
}

// The customer detail page's purchase history data source — every
// item bought, at what price, on what date, plus the payment split,
// queried directly from the same DailySale/DailySaleItem/
// DailySalePayment rows Daily Sales wrote (not a copy). Exists for
// every sale, cash, account, or credit.
//
// A single DailySale row can hold more than one visit (a customer who
// came back later the same day appends to it rather than getting a
// second row — see findTodaysSale), so items/payments are grouped by
// visitAt into separate "visits" here, each with its own item list,
// payment split, and total — otherwise a second visit's items would
// look indistinguishable from the first's on the same date.
export async function getCustomerPurchaseHistory(customerId: string) {
  const shopId = await getCurrentShopId();

  const sales = await db.dailySale.findMany({
    where: { customerId, shopId },
    include: { items: { include: { product: true } }, payments: true },
    orderBy: { saleDate: "desc" },
  });

  return sales.map((sale) => {
    const visitTimes = Array.from(new Set(sale.items.map((i) => i.visitAt.getTime()))).sort((a, b) => b - a);

    const visits = visitTimes.map((time) => {
      const visitItems = sale.items.filter((i) => i.visitAt.getTime() === time);
      const visitPayments = sale.payments.filter((p) => p.visitAt.getTime() === time);
      const items = visitItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        quantity: Number(item.quantity),
        actualPrice: Number(item.actualPrice),
      }));
      return {
        visitAt: new Date(time),
        items,
        payments: visitPayments.map((p) => ({
          paymentMethod: p.paymentMethod,
          amount: Number(p.amount),
        })),
        total: items.reduce((sum, i) => sum + i.quantity * i.actualPrice, 0),
      };
    });

    return {
      id: sale.id,
      saleDate: sale.saleDate,
      season: sale.season,
      visits,
    };
  });
}

// The edit form's data source for one sale — same shape
// getCustomerPurchaseHistory's per-sale entries use, so the edit
// modal can be pre-filled with exactly what's already there.
export async function getDailySaleForEdit(saleId: string) {
  const shopId = await getCurrentShopId();

  const sale = await db.dailySale.findFirst({
    where: { id: saleId, shopId },
    include: { items: { include: { product: true } }, payments: true },
  });
  if (!sale) throw new Error("Sale not found");

  const paymentsByMethod = Object.fromEntries(
    sale.payments.map((p) => [p.paymentMethod, Number(p.amount)])
  );

  return {
    id: sale.id,
    customerId: sale.customerId,
    items: sale.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      quantity: Number(item.quantity),
      actualPrice: Number(item.actualPrice),
    })),
    payments: {
      cash: paymentsByMethod.CASH ?? 0,
      account: paymentsByMethod.ACCOUNT ?? 0,
      credit: paymentsByMethod.CREDIT ?? 0,
    },
  };
}

// Summary-only rows for the Sales history list — customer name,
// date, item count, total bill. Full line-item detail deliberately
// doesn't live here; it's on the customer's own detail page.
export async function listDailySales(options?: {
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = {
    shopId,
    customerId: options?.customerId || undefined,
    saleDate: {
      gte: options?.fromDate ? new Date(options.fromDate) : undefined,
      lte: options?.toDate ? new Date(options.toDate) : undefined,
    },
  };

  const [sales, totalCount] = await Promise.all([
    db.dailySale.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { saleDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dailySale.count({ where }),
  ]);

  return {
    sales: sales.map((sale) => ({
      id: sale.id,
      customerId: sale.customerId,
      customerName: sale.customer.name,
      saleDate: sale.saleDate,
      itemCount: sale.items.length,
      total: sale.items.reduce((sum, i) => sum + Number(i.actualPrice) * Number(i.quantity), 0),
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}
