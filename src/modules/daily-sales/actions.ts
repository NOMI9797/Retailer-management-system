"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import { postToBankAccount } from "@/modules/settings/bankAccounts.actions";
import { postToPooledGrainStock } from "@/modules/stock/actions";
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

type Result<T> = { success: true; data: T } | { success: false; error: string };

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
): Promise<Result<{ itemTotal: number; grainItems: { id: string; creditAmount: Prisma.Decimal | null }[] }>> {
  let itemTotal = 0;
  const grainItems: { id: string; creditAmount: Prisma.Decimal | null }[] = [];

  for (const item of items) {
    const product = await tx.product.findFirst({ where: { id: item.productId, shopId } });
    if (!product) return { success: false, error: "Product not found" };

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
        return { success: false, error: `Not enough stock for ${product.name} (have ${product.quantity}, need ${item.quantity})` };
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
        return { success: false, error: `Not enough grain stock for ${product.name} (short by ${remaining})` };
      }

      // Pooled stock: deduct the quantity sold and the full sale
      // REVENUE (not cost — deliberate, see postToPooledGrainStock's
      // comment), regardless of how many batches the FIFO loop above
      // actually drew from. The quantity guard above (physical
      // availability) already ran, so this never needs its own check.
      await postToPooledGrainStock(tx, product.id, -item.quantity, -(item.actualPrice * item.quantity));
    }

    itemTotal += item.actualPrice * item.quantity;
  }

  return { success: true, data: { itemTotal, grainItems } };
}

// The BUYER side: validates the Cash/Account/Credit split sums to the
// bill total and records one DailySalePayment row per method actually
// used. Cash/Account are purely informational, same as before — but a
// Credit portion now posts a real debt, tagged with this sale's id so
// editing/deleting the sale reverses it correctly (see
// reverseSaleContents). When the buyer is a CUSTOMER, that debt posts
// onto their Udhaar account (auto-created if they don't have one yet)
// — every other account type is still never touched from here, only
// Udhaar, and only for the Credit amount. When the buyer is a DEALER
// (buyerId refers to a Dealer instead — see createDailySaleSchema's
// "exactly one of customerId/dealerId" rule), that same Credit amount
// instead posts onto the DEALER's own Udhaar balance, in the OPPOSITE
// sign direction: a dealer sale's Credit means the DEALER now owes
// the SHOP (mirrors how DealerAccount's normal "shop owes dealer"
// convention inverts for a sale instead of a purchase — see
// DealerTransaction's isDealerSale schema comment).
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
  buyer: { customerId: string } | { dealerId: string },
  saleId: string,
  itemTotal: number,
  payments: PaymentSplitInput,
  visitAt: Date,
  grainItems: { id: string; creditAmount: Prisma.Decimal | null }[]
): Promise<Result<void>> {
  const splitTotal = payments.cash + payments.account + payments.credit;
  if (Math.abs(splitTotal - itemTotal) > PAYMENT_SPLIT_EPSILON) {
    return {
      success: false,
      error: `Payment split (${splitTotal}) doesn't match the bill total (${itemTotal}) — cash + account + credit must add up exactly.`,
    };
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
      return {
        success: false,
        error: "This sale has more than one grain item and an Udhaar amount — specify how much Udhaar applies to each grain item.",
      };
    }
    const grainCreditTotal = grainItems.reduce((sum, g) => sum + Number(g.creditAmount), 0);
    if (grainCreditTotal > payments.credit + PAYMENT_SPLIT_EPSILON) {
      return {
        success: false,
        error: `The grain items' Udhaar amounts (${grainCreditTotal}) add up to more than the sale's total Udhaar (${payments.credit}).`,
      };
    }
  }

  if (payments.cash > 0) {
    await tx.dailySalePayment.create({
      data: { dailySaleId: saleId, paymentMethod: "CASH", amount: payments.cash, visitAt },
    });
  }
  if (payments.account > 0) {
    await tx.dailySalePayment.create({
      data: {
        dailySaleId: saleId,
        paymentMethod: "ACCOUNT",
        amount: payments.account,
        bankAccountId: payments.bankAccountId,
        visitAt,
      },
    });
    // A sale is money coming INTO the shop.
    if (payments.bankAccountId) {
      await postToBankAccount(tx, payments.bankAccountId, payments.account);
    }
  }
  if (payments.credit > 0) {
    await tx.dailySalePayment.create({
      data: { dailySaleId: saleId, paymentMethod: "CREDIT", amount: payments.credit, visitAt },
    });

    if ("customerId" in buyer) {
      const udharType = await tx.accountType.findFirst({ where: { shopId, name: "Udhaar" } });
      if (udharType) {
        let udharAccount = await tx.customerAccount.findFirst({
          where: { customerId: buyer.customerId, accountTypeId: udharType.id },
        });
        if (!udharAccount) {
          udharAccount = await tx.customerAccount.create({
            data: { customerId: buyer.customerId, accountTypeId: udharType.id },
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
    } else {
      // Selling to a dealer on Credit — the DEALER now owes the shop,
      // the opposite sign from DealerAccount's normal "shop owes
      // dealer" convention (see this function's header comment and
      // DealerTransaction.isDealerSale's schema comment). Every
      // dealer always has an account (createDealer creates one in the
      // same call), so this is a plain lookup, never a find-or-create.
      const dealerAccount = await tx.dealerAccount.findUniqueOrThrow({ where: { dealerId: buyer.dealerId } });
      await tx.dealerTransaction.create({
        data: {
          dealerAccountId: dealerAccount.id,
          direction: "IN",
          amount: payments.credit,
          linkedSaleId: saleId,
          isDealerSale: true,
          paymentMethod: "CREDIT",
          notes: "Credit sale to dealer",
        },
      });
      // IN here means the shop's "owed to dealer" balance moves
      // toward (and past) zero into the dealer owing the shop —
      // decrementing is correct in both conventions: it always means
      // "less owed to the dealer," which becomes negative once a
      // dealer-sale debt exceeds any existing purchase-side balance.
      await tx.dealerAccount.update({
        where: { id: dealerAccount.id },
        data: { currentBalance: { decrement: payments.credit } },
      });
    }
  }
  return { success: true, data: undefined };
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
async function reverseSaleContents(
  tx: Prisma.TransactionClient,
  shopId: string,
  saleId: string
): Promise<Result<{ customerId: string | null; dealerId: string | null; season: string | null }>> {
  const sale = await tx.dailySale.findFirst({
    where: { id: saleId, shopId },
    include: { items: { include: { batchAllocations: true } } },
  });
  if (!sale) return { success: false, error: "Sale not found" };

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
      // Symmetric undo of the pooled-stock posting applySaleItems
      // made for this item — exact negation, same revenue-based
      // (not cost-based) figure.
      await postToPooledGrainStock(
        tx,
        product.id,
        Number(item.quantity),
        Number(item.actualPrice) * Number(item.quantity)
      );
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

  // Same reversal for a dealer sale's Credit posting (see
  // applyPaymentSplit's dealer branch) — IN there decremented
  // DealerAccount.currentBalance, so undoing it increments.
  const dealerTransactions = await tx.dealerTransaction.findMany({
    where: { linkedSaleId: saleId },
  });
  for (const txn of dealerTransactions) {
    const amount = Number(txn.amount);
    const originalEffectWasDecrement = txn.direction === "IN";
    await tx.dealerAccount.update({
      where: { id: txn.dealerAccountId },
      data: {
        currentBalance: originalEffectWasDecrement ? { increment: amount } : { decrement: amount },
      },
    });
  }
  await tx.dealerTransaction.deleteMany({ where: { linkedSaleId: saleId } });

  // Reverse any bank account posting this sale's ACCOUNT payment made
  // — same "undo before the rows disappear" requirement the ledger
  // reversal above follows, since a sale being edited/deleted must
  // leave every balance it touched exactly as if the sale never
  // happened.
  const accountPayments = await tx.dailySalePayment.findMany({
    where: { dailySaleId: saleId, paymentMethod: "ACCOUNT", bankAccountId: { not: null } },
  });
  for (const payment of accountPayments) {
    await postToBankAccount(tx, payment.bankAccountId!, -Number(payment.amount));
  }
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
    return {
      success: false,
      error: "This sale has a recorded Udhaar repayment against one of its grain items — it can't be edited or deleted while that payment history exists.",
    };
  }

  await tx.dailySaleItemBatch.deleteMany({ where: { dailySaleItemId: { in: itemIds } } });
  await tx.dailySaleItem.deleteMany({ where: { dailySaleId: saleId } });

  return { success: true, data: { customerId: sale.customerId, dealerId: sale.dealerId, season: sale.season } };
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
  buyer: { customerId: string } | { dealerId: string },
  referenceDate: Date
) {
  const { startOfDay, endOfDay } = dayBoundsFor(referenceDate);

  return tx.dailySale.findFirst({
    where: { shopId, ...buyer, saleDate: { gte: startOfDay, lte: endOfDay } },
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
  // Exactly one of these is set, enforced by createDailySaleSchema's
  // own .refine() — narrows to the shared { customerId } | { dealerId }
  // shape every buyer-scoped helper below expects.
  const buyer = data.customerId ? { customerId: data.customerId } : { dealerId: data.dealerId! };

  return db.$transaction(async (tx) => {
    if ("customerId" in buyer) {
      const customer = await tx.customer.findFirst({ where: { id: buyer.customerId, shopId } });
      if (!customer) return { success: false, error: "Customer not found" };
    } else {
      const dealer = await tx.dealer.findFirst({ where: { id: buyer.dealerId, shopId } });
      if (!dealer) return { success: false, error: "Dealer not found" };
    }

    const existingSale = await findTodaysSale(tx, shopId, buyer, targetDateTime);
    const sale =
      existingSale ??
      (await tx.dailySale.create({
        data: { shopId, ...buyer, season: data.season, saleDate: targetDateTime },
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
    const itemsResult = await applySaleItems(tx, shopId, sale.id, data.items, visitAt);
    if (!itemsResult.success) return itemsResult;
    const { itemTotal, grainItems } = itemsResult.data;

    const paymentResult = await applyPaymentSplit(tx, shopId, buyer, sale.id, itemTotal, data.payments, visitAt, grainItems);
    if (!paymentResult.success) return paymentResult;

    const created = await tx.dailySale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { items: true },
    });

    // items[].quantity/actualPrice are Prisma Decimals — must be
    // plain numbers before this crosses into the Client Component
    // that calls createDailySale (NewSaleForm's onSaved).
    return {
      success: true,
      data: {
        ...created,
        items: created.items.map(serializeDecimals),
      },
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
    const reverseResult = await reverseSaleContents(tx, shopId, data.saleId);
    if (!reverseResult.success) return reverseResult;

    // The edited items/payments are written as a single fresh visit —
    // editing a sale collapses whatever visit structure it had before
    // into the one edited version, which matches how the edit form
    // presents it (one combined item list, one combined split).
    const visitAt = new Date();
    const buyer = existingSale.customerId
      ? { customerId: existingSale.customerId }
      : { dealerId: existingSale.dealerId! };
    const itemsResult = await applySaleItems(tx, shopId, data.saleId, data.items, visitAt);
    if (!itemsResult.success) return itemsResult;
    const { itemTotal, grainItems } = itemsResult.data;

    const paymentResult = await applyPaymentSplit(tx, shopId, buyer, data.saleId, itemTotal, data.payments, visitAt, grainItems);
    if (!paymentResult.success) return paymentResult;

    const updated = await tx.dailySale.findUniqueOrThrow({
      where: { id: data.saleId },
      include: { items: true },
    });

    return {
      success: true,
      data: {
        ...updated,
        items: updated.items.map(serializeDecimals),
      },
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

  return db.$transaction(async (tx) => {
    const reverseResult = await reverseSaleContents(tx, shopId, saleId);
    if (!reverseResult.success) return reverseResult;
    await tx.dailySale.delete({ where: { id: saleId } });
    return { success: true, data: undefined };
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

  const [sales, clearances, udhaarGiven] = await Promise.all([
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
    // A loan given on the Regular/Daily Udhaar bucket — either a
    // manually recorded one (RecordAccountTransactionModal) or an
    // imported legacy balance (importLegacyUdhaar) — shows up here
    // too, same as a real Credit sale already does, since both are
    // "this customer now owes the shop more." Excludes isLongTerm
    // (its own separate Debts tab) and isShopBorrowed (the opposite
    // direction entirely — shop owes customer) so neither leaks into
    // this customer-owes-shop history feed. Also excludes anything
    // with linkedSaleId set — that's the posting applyPaymentSplit
    // already writes for a Credit sale's own Udhaar charge, which is
    // already shown via its DailySale row above; without this
    // exclusion the same Credit purchase would render twice.
    db.accountTransaction.findMany({
      where: {
        direction: "OUT",
        isLongTerm: false,
        isShopBorrowed: false,
        linkedSaleId: null,
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

  const udhaarGivenEntries = udhaarGiven.map((txn) => ({
    kind: "UDHAAR_GIVEN" as const,
    id: txn.id,
    saleDate: txn.transactionDate,
    amount: Number(txn.amount),
    paymentMethod: txn.paymentMethod,
    notes: txn.notes,
  }));

  return [...saleEntries, ...clearanceEntries, ...udhaarGivenEntries].sort(
    (a, b) => b.saleDate.getTime() - a.saleDate.getTime()
  );
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
// scoped to one customer and/or one grain product — the "Grain
// Udhaar" subtab's table data source, both shop-wide (Debts page) and
// per-customer (customer detail page), depending on whether
// customerId is passed. productId powers the Debts page's product
// filter, same "optional narrowing param" shape getShopOwedForGrain
// already established for the mirror (Shop Udhaar) case.
export async function getCustomerGrainCreditPurchases(customerId?: string, productId?: string) {
  const shopId = await getCurrentShopId();

  const items = await db.dailySaleItem.findMany({
    where: {
      creditAmount: { not: null },
      productId: productId || undefined,
      product: { shopId, stockKind: "GRAIN" },
      // Scoped to CUSTOMER sales only — a dealer sale's Credit posts
      // to DealerAccount instead (see applyPaymentSplit), not this
      // per-item Customer Udhaar view, so dealer-bought grain items
      // never show up here even though they share the same
      // DailySaleItem.creditAmount mechanism.
      dailySale: { customerId: customerId ? customerId : { not: null }, shopId },
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
      // The query above already scopes to customerId: { not: null },
      // so every row here genuinely has a customer — non-null
      // assertion documents that guarantee rather than re-deriving it.
      return {
        dailySaleItemId: item.id,
        customerId: item.dailySale.customerId!,
        customerName: item.dailySale.customer!.name,
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

// Stat-card totals for the Grain Udhaar subtab — same shape as
// getShopExpenseUdhaarSummary/getShopBorrowedSummary.
export async function getCustomerGrainCreditSummary(customerId?: string, productId?: string) {
  const rows = await getCustomerGrainCreditPurchases(customerId, productId);

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
  if (!item || item.creditAmount === null) return { success: false, error: "Grain sale item not found" };

  const paidSoFar = item.creditPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Number(item.creditAmount) - paidSoFar;
  if (data.amount > remaining + 0.01) {
    return {
      success: false,
      error: `This payment (Rs ${data.amount}) is more than what's actually owed (Rs ${remaining}) — a payment can't exceed what's owed.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.grainSaleCreditPayment.create({
      data: {
        dailySaleItemId: item.id,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        notes: data.notes,
      },
    });
    // A repayment is money coming INTO the shop.
    if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
      await postToBankAccount(tx, data.bankAccountId, data.amount);
    }
  });
  return { success: true, data: undefined };
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
  const accountPayment = sale.payments.find((p) => p.paymentMethod === "ACCOUNT");

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
      bankAccountId: accountPayment?.bankAccountId ?? undefined,
    },
  };
}

// Summary-only rows for the Sales history list — buyer name, date,
// item count, total bill. Full line-item detail deliberately doesn't
// live here; it's on the buyer's own detail page. One row in the
// merged history feed — either a real product sale, or an Udhaar
// Clearance (a repayment recorded against a customer's Udhaar/Regular
// account, via recordAccountTransaction — Udhaar Clearances are a
// customer-only concept, since a dealer's own repayments are recorded
// on the Dealer detail page instead, not merged into this feed). Both
// are keyed off `kind` so SalesHistoryTable can render each
// appropriately (a clearance has no items, just an amount and a
// distinct badge). A SALE row's buyer is either a customer or a
// dealer — buyerKind distinguishes which, since a dealer sale has no
// customer detail page to link to.
export type DailySaleHistoryRow =
  | {
      kind: "SALE";
      id: string;
      buyerKind: "CUSTOMER" | "DEALER";
      buyerId: string;
      buyerName: string;
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
  // A to-one relation filter in Prisma implies "the relation exists
  // and matches," even with every field inside it undefined — so
  // passing `customer: {...}` unconditionally would silently exclude
  // every dealer sale (customerId: null) the moment this function is
  // called at all, not just when a customer-only filter is active.
  // Only attach it when the caller actually asked for a customer-only
  // narrowing (search/area/accountType), so an unfiltered or
  // dealer-inclusive listing still returns dealer sales.
  const hasCustomerFilter = !!(options?.search || options?.areaId || options?.accountTypeId);

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
    // these live on DailySale itself. Dealer sales have no customer
    // relation to match, so this filter never applies to them — a
    // name/area/account-type search is a customer-only lookup by
    // design (dealers have no area or account-type concept).
    customer: hasCustomerFilter ? customerFilter : undefined,
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
      include: { customer: true, dealer: true, items: true, payments: true },
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
    // breakdown lives in paymentTotals and on the buyer's own detail
    // page.
    const methodsUsed = (Object.keys(paymentTotals) as (keyof typeof paymentTotals)[]).filter(
      (m) => paymentTotals[m] > 0
    );
    const paymentSummary = methodsUsed.length === 1 ? methodsUsed[0] : methodsUsed.length > 1 ? "MIXED" : null;

    // Exactly one of customer/dealer is set — enforced at the Zod/
    // action layer (see DailySale's schema comment) — so this is a
    // safe either/or read, never a guess.
    const buyerKind: "CUSTOMER" | "DEALER" = sale.customer ? "CUSTOMER" : "DEALER";
    const buyerId = sale.customer ? sale.customer.id : sale.dealer!.id;
    const buyerName = sale.customer ? sale.customer.name : sale.dealer!.name;

    return {
      kind: "SALE",
      id: sale.id,
      buyerKind,
      buyerId,
      buyerName,
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
