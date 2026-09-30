"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import {
  createDailySaleSchema,
  updateDailySaleSchema,
  payGrainSaleItemCreditSchema,
  type CreateDailySaleInput,
  type UpdateDailySaleInput,
  type DailySaleItemInput,
  type PaymentSplitInput,
  type PayGrainSaleItemCreditInput,
} from "./schema";
import type { Prisma } from "@prisma/client";

const DEFAULT_PAGE_SIZE = 50;
const PAYMENT_SPLIT_EPSILON = 0.01; // guards against float rounding, not real mismatches

// The core "make this sale real" logic for the ITEMS side — decrement
// stock/batches, post Stock Udhaar when a sale draws on a customer's
// deposited (not-yet-purchased) batch. Completely independent of how
// the buyer pays — this only computes and returns the item total,
// which applyPaymentSplit then checks the payment split against.
// Shared by createDailySale and updateDailySale so there is exactly
// one implementation of the batch-depletion/Stock Udhaar math, never
// two copies that could drift out of sync.
async function applySaleItems(
  tx: Prisma.TransactionClient,
  shopId: string,
  saleId: string,
  items: DailySaleItemInput[],
  visitAt: Date
) {
  let itemTotal = 0;
  const grainItems: { id: string; creditAmount: Prisma.Decimal | null }[] = [];

  for (const item of items) {
    const product = await tx.product.findFirst({ where: { id: item.productId, shopId } });
    if (!product) throw new Error("Product not found");

    const saleItem = await tx.dailySaleItem.create({
      data: {
        dailySaleId: saleId,
        productId: item.productId,
        quantity: item.quantity,
        actualPrice: item.actualPrice,
        // Snapshot cost at sale time — only meaningful for SIMPLE
        // stock (grain COGS is derived later from batch rate ×
        // quantity via DailySaleItemBatch, since each batch already
        // permanently records its own rate).
        costPriceAtSale: product.stockKind === "SIMPLE" ? product.costPrice : null,
        // How much of THIS item's own price is Credit — only ever
        // meaningful for GRAIN (see dailySaleItemSchema's comment);
        // validated against the sale-level credit total in
        // applyPaymentSplit, not here, since that total isn't known
        // until every item has been processed.
        creditAmount: product.stockKind === "GRAIN" ? (item.creditAmount ?? null) : null,
        creditDueDate:
          product.stockKind === "GRAIN" && item.creditDueDate ? parseLocalDateStart(item.creditDueDate) : null,
        visitAt,
      },
    });

    if (product.stockKind === "GRAIN") {
      grainItems.push({ id: saleItem.id, creditAmount: saleItem.creditAmount });
    }

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
        include: { ownerCustomer: true },
      });

      let remaining = item.quantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        // A customer batch's quantityTransferred portion has already
        // moved to a NEW shop-owned batch (see stock/actions.ts:
        // createTransferPurchase) and must not be sold again from
        // here — that stock is now that other batch's row to deplete.
        // Always 0 for shop-owned batches, so this is a no-op there.
        const available =
          Number(batch.quantityIn) - Number(batch.quantitySold) - Number(batch.quantityTransferred);
        if (available <= 0) continue;

        const takeFromBatch = Math.min(available, remaining);

        // Only a customer batch can ever be rate-less (a "store for
        // later" deposit still awaiting settlement — see
        // GrainBatch.rate's schema comment; a shop-owned batch always
        // has a real rate from the moment it's created). Selling from
        // it is allowed with NO cost basis yet — the shopkeeper often
        // can't know it at sale time, since the rate only gets agreed
        // when they later settle with the depositor (see
        // createTransferPurchase). Never guessed and never forced up
        // front: if the caller happens to already know the rate (an
        // optional override), it's saved onto the batch now; otherwise
        // the batch stays rate-less and getPnlReport reports this
        // portion's cost as "unknown" rather than silently treating it
        // as 0 — see that function's hasUnknownCost handling. Once the
        // batch is later priced (a transfer-purchase, or another sale
        // item supplying an override), every past sale that already
        // drew from it becomes correctly costed automatically, since
        // getPnlReport reads the batch's rate live, not a snapshot.
        if (batch.rate === null) {
          const override = item.batchRateOverrides?.[batch.id];
          if (override !== undefined) {
            await tx.grainBatch.update({ where: { id: batch.id }, data: { rate: override } });
          }
        }

        remaining -= takeFromBatch;

        await tx.grainBatch.update({
          where: { id: batch.id },
          data: { quantitySold: { increment: takeFromBatch } },
        });
        await tx.dailySaleItemBatch.create({
          data: { dailySaleItemId: saleItem.id, grainBatchId: batch.id, quantity: takeFromBatch },
        });

        if (batch.ownerCustomerId) {
          // Selling from a customer's deposited batch BEFORE the
          // shopkeeper has purchased/settled it with them (see Stock
          // Management spec, "Stock Udhaar"). This must NOT reduce the
          // customer's ownership claim (that's quantityTransferred,
          // untouched here — only quantitySold, the physical count,
          // moved above) and must NOT auto-pay them — payment only
          // happens later via an explicit transfer-purchase
          // (stock/actions.ts: createTransferPurchase). Instead this
          // grows a tracked, auditable shortfall the shopkeeper still
          // owes the customer in STOCK, not money.
          await tx.stockUdhaarEntry.create({
            data: {
              customerId: batch.ownerCustomerId,
              productId: product.id,
              grainBatchId: batch.id,
              quantity: takeFromBatch,
              linkedSaleId: saleId,
              notes: `Sold from ${product.name} deposit before settlement`,
            },
          });
        }
      }

      if (remaining > 0) {
        throw new Error(`Not enough grain stock for ${product.name} (short by ${remaining})`);
      }
    }

    itemTotal += item.actualPrice * item.quantity;
  }

  return { itemTotal, grainItems };
}

// The BUYER side: validates the Cash/Account/Credit split sums to the
// bill total and records one DailySalePayment row per method actually
// used. Cash/Account are purely informational, same as before — but a
// Credit portion now posts a real debt onto the customer's Udhaar
// account (auto-created if they don't have one yet), tagged with this
// sale's id so editing/deleting the sale reverses it correctly (see
// reverseSaleContents). Every other account type is still never
// touched from here — only Udhaar, and only for the Credit amount.
//
// grainItems (already-created DailySaleItem rows for this sale, GRAIN
// only) is used to enforce the "Customer Udhaar" per-item tracking
// invariant: when a sale has MORE THAN ONE grain item and any Credit
// was used, each grain item's own creditAmount must be explicitly
// set (never guessed) and they must sum to exactly the portion of
// payments.credit attributable to grain (payments.credit itself, when
// every item in the sale is grain — otherwise the grain items' sum
// can be anywhere from 0 up to payments.credit, since some of that
// credit may belong to a non-grain item instead). A single grain item
// needs no explicit split — its own creditAmount defaults to the
// whole payments.credit when omitted, since there's nothing to
// disambiguate (see dailySaleItemSchema's comment).
async function applyPaymentSplit(
  tx: Prisma.TransactionClient,
  shopId: string,
  customerId: string,
  saleId: string,
  itemTotal: number,
  payments: PaymentSplitInput,
  visitAt: Date,
  grainItems: { id: string; creditAmount: Prisma.Decimal | null }[]
) {
  const splitTotal = payments.cash + payments.account + payments.credit;
  if (Math.abs(splitTotal - itemTotal) > PAYMENT_SPLIT_EPSILON) {
    throw new Error(
      `Payment split (${splitTotal}) doesn't match the bill total (${itemTotal}) — cash + account + credit must add up exactly.`
    );
  }

  if (payments.credit > 0 && grainItems.length === 1 && grainItems[0].creditAmount === null) {
    // A single grain item is unambiguous — its own credit amount is
    // exactly the sale's whole credit total when the shopkeeper
    // didn't explicitly enter a per-item split (see
    // dailySaleItemSchema's comment). Filled in here rather than
    // required from the client, so the common "one grain item"
    // sale keeps today's simple one-field flow.
    await tx.dailySaleItem.update({
      where: { id: grainItems[0].id },
      data: { creditAmount: payments.credit },
    });
  } else if (payments.credit > 0 && grainItems.length > 1) {
    const missing = grainItems.some((g) => g.creditAmount === null);
    if (missing) {
      throw new Error(
        "This sale has more than one grain item and an Udhaar amount — specify how much Udhaar applies to each grain item."
      );
    }
    const grainCreditTotal = grainItems.reduce((sum, g) => sum + Number(g.creditAmount), 0);
    if (grainCreditTotal > payments.credit + PAYMENT_SPLIT_EPSILON) {
      throw new Error(
        `The grain items' Udhaar amounts (${grainCreditTotal}) add up to more than the sale's total Udhaar (${payments.credit}).`
      );
    }
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

    const udharType = await tx.accountType.findFirst({ where: { shopId, name: "Udhaar" } });
    if (udharType) {
      let udharAccount = await tx.customerAccount.findFirst({
        where: { customerId, accountTypeId: udharType.id },
      });
      if (!udharAccount) {
        udharAccount = await tx.customerAccount.create({
          data: { customerId, accountTypeId: udharType.id },
        });
      }

      await tx.accountTransaction.create({
        data: {
          customerAccountId: udharAccount.id,
          direction: "OUT",
          amount: payments.credit,
          linkedSaleId: saleId,
          paymentMethod: "CREDIT",
          notes: "Credit sale — auto-posted to Udhaar",
        },
      });
      // Debt convention (see recordAccountTransaction): OUT means the
      // customer now owes more, so balance increments.
      await tx.customerAccount.update({
        where: { id: udharAccount.id },
        data: { currentBalance: { increment: payments.credit } },
      });
    }
  }
}

// Completely undoes a sale's effects: restores simple stock and grain
// batch quantities, reverses every buyer-Udhaar AccountTransaction
// linked to it with an exact opposite adjustment to the account's
// currentBalance, inserts a compensating entry for any Stock Udhaar
// the sale grew (see the comment above that insert — never a hard
// delete, since a later transfer-purchase may have already settled
// part of it), then deletes the batch allocations, sale items,
// payments, and transactions. Deliberately does NOT delete the
// DailySale row itself — that's what lets updateDailySale reuse the
// same id after reapplying, rather than the edit silently creating a
// new sale with a different id. deleteDailySale calls this and then
// removes the row as its own final step.
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

  // Reverse every ledger posting this sale made — the buyer's Udhaar
  // credit charge carries this linkedSaleId (the only kind of
  // AccountTransaction createDailySale ever writes; a transfer-purchase's
  // payment is a separate flow with its own linkedTransferBatchId, not
  // reversed here). Every account now shares one debt convention: OUT
  // increments currentBalance (customer owes more), IN decrements it
  // (customer paid down) — see recordAccountTransaction's comment.
  const transactions = await tx.accountTransaction.findMany({
    where: { linkedSaleId: saleId },
  });
  for (const txn of transactions) {
    const amount = Number(txn.amount);
    const originalEffectWasIncrement = txn.direction === "OUT";
    await tx.customerAccount.update({
      where: { id: txn.customerAccountId },
      data: {
        currentBalance: originalEffectWasIncrement ? { decrement: amount } : { increment: amount },
      },
    });
  }
  await tx.accountTransaction.deleteMany({ where: { linkedSaleId: saleId } });
  await tx.dailySalePayment.deleteMany({ where: { dailySaleId: saleId } });

  // Reverse any Stock Udhaar this sale created — via a COMPENSATING
  // entry, not a delete. A later transfer-purchase may already have
  // settled part of this shortfall (see createTransferPurchase); a
  // hard delete would leave that settlement's negative entries
  // dangling with nothing to offset, silently making the customer's
  // ledger show a phantom negative shortfall. Inserting the exact
  // negation instead preserves full history and always nets correctly
  // regardless of what settled in between.
  const stockUdhaarGrowthEntries = await tx.stockUdhaarEntry.findMany({
    where: { linkedSaleId: saleId, quantity: { gt: 0 } },
  });
  for (const entry of stockUdhaarGrowthEntries) {
    await tx.stockUdhaarEntry.create({
      data: {
        customerId: entry.customerId,
        productId: entry.productId,
        grainBatchId: entry.grainBatchId,
        quantity: -Number(entry.quantity),
        linkedSaleId: saleId,
        notes: "Reversed — sale edited/deleted",
      },
    });
  }

  const itemIds = sale.items.map((i) => i.id);

  // A grain item that already has a recorded Customer Udhaar
  // repayment (see daily-sales/actions.ts: payGrainSaleItemCredit)
  // must not be deleted out from under that payment history — the
  // FK cascade would otherwise silently destroy real money-collected
  // records the moment this sale is edited or deleted, same risk the
  // Stock Udhaar handling above deliberately avoids via compensating
  // entries instead of hard deletes.
  const existingPayment = await tx.grainSaleCreditPayment.findFirst({
    where: { dailySaleItemId: { in: itemIds } },
  });
  if (existingPayment) {
    throw new Error(
      "This sale has a recorded Udhaar repayment against one of its grain items — it can't be edited or deleted while that payment history exists."
    );
  }

  await tx.dailySaleItemBatch.deleteMany({ where: { dailySaleItemId: { in: itemIds } } });
  await tx.dailySaleItem.deleteMany({ where: { dailySaleId: saleId } });

  return { customerId: sale.customerId, season: sale.season };
}

// A customer buying again later the same day joins their existing
// DailySale row for that date instead of getting a second one — per
// the "one record per customer per day" rule: Sales history then
// shows one combined row (total items, total amount) rather than
// duplicate-looking entries for the same customer/date, while the
// Purchase History panel still lists every item bought. "Same day" is
// calendar-day in the server's local time, matching how saleDate is
// displayed everywhere else (formatDate). `referenceDate` defaults to
// today but can be a shopkeeper-picked past date instead (see
// createDailySale's saleDate input) — a backdated entry still merges
// correctly with any other sale already recorded for that customer on
// that same picked date, exactly like a same-day entry does for today.
function dayBoundsFor(referenceDate: Date) {
  const startOfDay = new Date(referenceDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(referenceDate);
  endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

async function findTodaysSale(
  tx: Prisma.TransactionClient,
  shopId: string,
  customerId: string,
  referenceDate: Date
) {
  const { startOfDay, endOfDay } = dayBoundsFor(referenceDate);

  return tx.dailySale.findFirst({
    where: { shopId, customerId, saleDate: { gte: startOfDay, lte: endOfDay } },
  });
}

// Combines a shopkeeper-picked "YYYY-MM-DD" with the CURRENT
// time-of-day, per the "backdated sale keeps a real time, not
// midnight" decision — so entering several backdated sales for
// different customers in one sitting still orders/groups them
// distinctly rather than every one collapsing onto the same
// midnight timestamp. Falls back to exactly `new Date()` when no date
// is given (the normal, non-backdated path).
function resolveSaleDateTime(saleDate?: string): Date {
  if (!saleDate) return new Date();
  const now = new Date();
  const picked = parseLocalDateStart(saleDate);
  picked.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return picked;
}

// The one transaction that makes a sale real, start to finish. Must
// not partially apply — a failure anywhere (insufficient stock, a
// mismatched payment split) rolls back everything: the DailySale row
// (or the items/payments just appended to today's existing one),
// every stock/batch decrement, and every ledger posting.
export async function createDailySale(input: CreateDailySaleInput) {
  const shopId = await getCurrentShopId();
  const data = createDailySaleSchema.parse(input);
  const targetDateTime = resolveSaleDateTime(data.saleDate);

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, shopId } });
    if (!customer) throw new Error("Customer not found");

    const existingSale = await findTodaysSale(tx, shopId, data.customerId, targetDateTime);
    const sale =
      existingSale ??
      (await tx.dailySale.create({
        data: { shopId, customerId: data.customerId, season: data.season, saleDate: targetDateTime },
      }));

    // Only this purchase's own items count toward the payment split
    // check — a returning customer's new items/payments are appended
    // on top of whatever was already recorded for today, not merged
    // into one combined split (per the "add a new split for just the
    // new items" decision). A single visitAt, shared by every item and
    // payment this call writes, is what lets the UI later regroup a
    // merged day's DailySale back into "visit 1", "visit 2", etc. Uses
    // the same target date/time as the sale itself, so a backdated
    // entry's visit groups under the picked date, not under today.
    const visitAt = targetDateTime;
    const { itemTotal, grainItems } = await applySaleItems(tx, shopId, sale.id, data.items, visitAt);
    await applyPaymentSplit(tx, shopId, data.customerId, sale.id, itemTotal, data.payments, visitAt, grainItems);

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
    const existingSale = await tx.dailySale.findFirstOrThrow({ where: { id: data.saleId, shopId } });
    await reverseSaleContents(tx, shopId, data.saleId);

    // The edited items/payments are written as a single fresh visit —
    // editing a sale collapses whatever visit structure it had before
    // into the one edited version, which matches how the edit form
    // presents it (one combined item list, one combined split).
    const visitAt = new Date();
    const { itemTotal, grainItems } = await applySaleItems(tx, shopId, data.saleId, data.items, visitAt);
    await applyPaymentSplit(
      tx,
      shopId,
      existingSale.customerId,
      data.saleId,
      itemTotal,
      data.payments,
      visitAt,
      grainItems
    );

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
// every sale, cash, account, or credit. Also merges in this
// customer's Udhaar Clearances (repayments, from
// recordAccountTransaction) as their own entries — same "sales AND
// repayments in one history feed" merge listDailySales does for the
// shop-wide Sales History table, just scoped to one customer.
//
// A single DailySale row can hold more than one visit (a customer who
// came back later the same day appends to it rather than getting a
// second row — see findTodaysSale), so items/payments are grouped by
// visitAt into separate "visits" here, each with its own item list,
// payment split, and total — otherwise a second visit's items would
// look indistinguishable from the first's on the same date.
export async function getCustomerPurchaseHistory(customerId: string) {
  const shopId = await getCurrentShopId();

  const [sales, clearances] = await Promise.all([
    db.dailySale.findMany({
      where: { customerId, shopId },
      include: { items: { include: { product: true } }, payments: true },
      orderBy: { saleDate: "desc" },
    }),
    db.accountTransaction.findMany({
      where: {
        direction: "IN",
        customerAccount: { customerId, customer: { shopId } },
      },
      orderBy: { transactionDate: "desc" },
    }),
  ]);

  const saleEntries = sales.map((sale) => {
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
      kind: "SALE" as const,
      id: sale.id,
      saleDate: sale.saleDate,
      season: sale.season,
      visits,
    };
  });

  const clearanceEntries = clearances.map((txn) => ({
    kind: "UDHAAR_CLEARANCE" as const,
    id: txn.id,
    saleDate: txn.transactionDate,
    amount: Number(txn.amount),
    paymentMethod: txn.paymentMethod,
  }));

  return [...saleEntries, ...clearanceEntries].sort((a, b) => b.saleDate.getTime() - a.saleDate.getTime());
}

// ── Customer Udhaar (a customer buying grain FROM the shop on
// Credit, not yet paid) ──────────────────────────────────────
// The mirror of Shop Udhaar (stock/actions.ts: getShopOwedForGrain —
// money the SHOP owes a customer for grain it bought from them). Here
// the customer is the one who owes: they bought grain from the shop
// at a settled rate and paid via Credit. Scoped to GRAIN items only
// (creditAmount is only ever set on those — see DailySaleItem's
// schema comment); a Credit purchase of a SIMPLE product still posts
// to the customer's whole-account Udhaar balance as before, just
// without this per-item breakdown.

// Every grain sale item with a recorded Credit amount, optionally
// scoped to one customer — the "Customer Udhaar" subtab's table data
// source, both shop-wide (Grain page) and per-customer (customer
// detail page), depending on whether customerId is passed.
export async function getCustomerGrainCreditPurchases(customerId?: string) {
  const shopId = await getCurrentShopId();

  const items = await db.dailySaleItem.findMany({
    where: {
      creditAmount: { not: null },
      product: { shopId, stockKind: "GRAIN" },
      dailySale: { customerId: customerId || undefined, shopId },
    },
    include: {
      product: { include: { unit: true } },
      dailySale: { include: { customer: true } },
      creditPayments: true,
    },
    orderBy: { visitAt: "desc" },
  });

  // Same week-long grace period the Debts page's overdue flag uses
  // (see modules/debts/actions.ts: GRACE_PERIOD_DAYS) — one definition
  // of "overdue" everywhere a due date is checked against today.
  const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return items
    .map((item) => {
      const borrowed = Number(item.creditAmount);
      const paid = item.creditPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      return {
        dailySaleItemId: item.id,
        customerId: item.dailySale.customerId,
        customerName: item.dailySale.customer.name,
        productId: item.productId,
        productName: item.product.name,
        unitName: item.product.unit.name,
        quantity: Number(item.quantity),
        rate: Number(item.actualPrice),
        purchaseDate: item.visitAt,
        dueDate: item.creditDueDate,
        isOverdue: item.creditDueDate !== null && item.creditDueDate.getTime() + GRACE_PERIOD_MS < now,
        borrowed,
        paid,
        remaining: borrowed - paid,
      };
    })
    .filter((row) => row.remaining > 0.01);
}

// Stat-card totals for the Customer Udhaar subtab — same shape as
// getShopExpenseUdhaarSummary/getShopBorrowedSummary.
export async function getCustomerGrainCreditSummary(customerId?: string) {
  const rows = await getCustomerGrainCreditPurchases(customerId);

  const totalBorrowed = rows.reduce((sum, r) => sum + r.borrowed, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0);
  const totalRemaining = rows.reduce((sum, r) => sum + r.remaining, 0);
  const customerCount = new Set(rows.map((r) => r.customerId)).size;

  return { totalBorrowed, totalPaid, totalRemaining, count: rows.length, customerCount };
}

// Pays down a customer's Credit purchase of a specific grain sale
// item — amount is capped at that item's own outstanding remainder,
// never trusted from the client. Supports partial payments; the item
// simply stops appearing in getCustomerGrainCreditPurchases once its
// remainder reaches zero. Deliberately does NOT touch the customer's
// Udhaar CustomerAccount.currentBalance — that balance was already
// incremented once, at sale time, by the sale's own AccountTransaction
// (see applyPaymentSplit); this per-item ledger is a finer-grained
// VIEW into that same debt, not a second, parallel source of truth,
// so double-counting a repayment here against currentBalance would
// silently understate what the customer still owes. A shopkeeper
// wanting to reduce currentBalance still uses the existing "Record
// repayment" action on the Regular/Daily Udhaar tab for that.
export async function payGrainSaleItemCredit(input: PayGrainSaleItemCreditInput) {
  const shopId = await getCurrentShopId();
  const data = payGrainSaleItemCreditSchema.parse(input);

  const item = await db.dailySaleItem.findFirst({
    where: { id: data.dailySaleItemId, product: { shopId } },
    include: { creditPayments: true },
  });
  if (!item || item.creditAmount === null) throw new Error("Grain sale item not found");

  const paidSoFar = item.creditPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Number(item.creditAmount) - paidSoFar;
  if (data.amount > remaining + 0.01) {
    throw new Error(
      `This payment (Rs ${data.amount}) is more than what's actually owed (Rs ${remaining}) — a payment can't exceed what's owed.`
    );
  }

  await db.grainSaleCreditPayment.create({
    data: {
      dailySaleItemId: item.id,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
    },
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
      creditAmount: item.creditAmount !== null ? Number(item.creditAmount) : undefined,
      creditDueDate: item.creditDueDate ? toLocalDateString(item.creditDueDate) : undefined,
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
// One row in the merged history feed — either a real product sale, or
// an Udhaar Clearance (a repayment recorded against a customer's
// Udhaar/Regular account, via recordAccountTransaction). Both are
// keyed off `kind` so SalesHistoryTable can render each appropriately
// (a clearance has no items, just an amount and a distinct badge).
export type DailySaleHistoryRow =
  | {
      kind: "SALE";
      id: string;
      customerId: string;
      customerName: string;
      saleDate: Date;
      itemCount: number;
      total: number;
      paymentSummary: "CASH" | "ACCOUNT" | "CREDIT" | "MIXED" | null;
    }
  | {
      kind: "UDHAAR_CLEARANCE";
      id: string;
      customerId: string;
      customerName: string;
      saleDate: Date;
      amount: number;
      paymentMethod: "CASH" | "ACCOUNT" | "CREDIT";
    };

export async function listDailySales(options?: {
  customerId?: string;
  search?: string;
  areaId?: string;
  accountTypeId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const customerFilter = {
    name: options?.search ? { contains: options.search, mode: "insensitive" as const } : undefined,
    areaId: options?.areaId || undefined,
    accounts: options?.accountTypeId ? { some: { accountTypeId: options.accountTypeId } } : undefined,
  };

  const dateFilter = {
    gte: options?.fromDate ? parseLocalDateStart(options.fromDate) : undefined,
    lte: options?.toDate ? parseLocalDateEnd(options.toDate) : undefined,
  };

  const where = {
    shopId,
    customerId: options?.customerId || undefined,
    saleDate: dateFilter,
    // Filtering by the buyer's name, area, or account type — this is
    // "find what this customer bought right now" support, not a sales
    // report; it goes through the customer relation since none of
    // these live on DailySale itself.
    customer: customerFilter,
  };

  // Udhaar Clearances are fetched with the same filters (customer/
  // date), so the merged feed reflects one consistent search across
  // both sales and repayments.
  const clearanceWhere = {
    direction: "IN" as const,
    transactionDate: dateFilter,
    customerAccount: {
      customerId: options?.customerId || undefined,
      customer: { shopId, ...customerFilter },
    },
  };

  // No database-level pagination across two different tables — fetch
  // every matching row from both, merge by date, then paginate the
  // combined list in memory. Fine for a single shop's daily volume;
  // revisit if this ever needs to scale past that.
  const [sales, clearances] = await Promise.all([
    db.dailySale.findMany({
      where,
      include: { customer: true, items: true, payments: true },
      orderBy: { saleDate: "desc" },
    }),
    db.accountTransaction.findMany({
      where: clearanceWhere,
      include: { customerAccount: { include: { customer: true } } },
      orderBy: { transactionDate: "desc" },
    }),
  ]);

  const saleRows: DailySaleHistoryRow[] = sales.map((sale) => {
    const paymentTotals = { CASH: 0, ACCOUNT: 0, CREDIT: 0 };
    for (const p of sale.payments) paymentTotals[p.paymentMethod] += Number(p.amount);
    // A summary tag for the row — "Cash"/"Account"/"Credit" when the
    // whole day's sale was paid one way, "Mixed" when more than one
    // method has a nonzero amount. Purely a display label; the real
    // breakdown lives in paymentTotals and on the customer's
    // Purchase History panel.
    const methodsUsed = (Object.keys(paymentTotals) as (keyof typeof paymentTotals)[]).filter(
      (m) => paymentTotals[m] > 0
    );
    const paymentSummary = methodsUsed.length === 1 ? methodsUsed[0] : methodsUsed.length > 1 ? "MIXED" : null;

    return {
      kind: "SALE",
      id: sale.id,
      customerId: sale.customerId,
      customerName: sale.customer.name,
      saleDate: sale.saleDate,
      itemCount: sale.items.length,
      total: sale.items.reduce((sum, i) => sum + Number(i.actualPrice) * Number(i.quantity), 0),
      paymentSummary,
    };
  });

  const clearanceRows: DailySaleHistoryRow[] = clearances.map((txn) => ({
    kind: "UDHAAR_CLEARANCE",
    id: txn.id,
    customerId: txn.customerAccount.customerId,
    customerName: txn.customerAccount.customer.name,
    saleDate: txn.transactionDate,
    amount: Number(txn.amount),
    paymentMethod: txn.paymentMethod,
  }));

  const merged = [...saleRows, ...clearanceRows].sort((a, b) => b.saleDate.getTime() - a.saleDate.getTime());
  const totalCount = merged.length;
  const paged = merged.slice((page - 1) * pageSize, page * pageSize);

  return {
    sales: paged,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

// The Sales history page's stat row — today's total, how many
// transactions, and the cash/account split for TODAY only (not
// affected by whatever filters the table below is showing), so a
// shopkeeper always has a stable end-of-day snapshot regardless of
// what they're currently searching for.
export async function getTodaysSalesStats() {
  const shopId = await getCurrentShopId();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const sales = await db.dailySale.findMany({
    where: { shopId, saleDate: { gte: startOfDay, lte: endOfDay } },
    include: { payments: true },
  });

  let cash = 0;
  let account = 0;
  let credit = 0;
  for (const sale of sales) {
    for (const p of sale.payments) {
      const amount = Number(p.amount);
      if (p.paymentMethod === "CASH") cash += amount;
      else if (p.paymentMethod === "ACCOUNT") account += amount;
      else credit += amount;
    }
  }

  return {
    transactionCount: sales.length,
    totalSales: cash + account + credit,
    cash,
    account,
    credit,
  };
}
