"use server";

import { mainUnitsPer, subUnitsPerUnit } from "@/modules/products/units";
import { db } from "@/lib/db";
import { loadCustomerUdhaar, loadShopOwesCustomer, GRACE_PERIOD_DAYS } from "@/modules/debts/udhaarLedger";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import { postToBankAccount } from "@/modules/settings/bankAccounts.actions";
import { postToPooledGrainStock } from "@/modules/stock/actions";
import { drawGrainFifo } from "@/modules/stock/grainFifo";
import {
  createDailySaleSchema,
  updateDailySaleSchema,
  updateReceiptSchema,
  type CreateDailySaleInput,
  type UpdateDailySaleInput,
  type UpdateReceiptInput,
  type DailySaleItemInput,
  type PaymentSplitInput,
} from "./schema";
import type { Prisma } from "@prisma/client";

type Result<T> = { success: true; data: T } | { success: false; error: string };

const PAYMENT_SPLIT_EPSILON = 0.01; // guards against float rounding, not real mismatches

// A sale write refused partway (payments not adding up, a bad discount,
// a missing product…) must change NOTHING. Returning { success: false }
// from inside db.$transaction would still commit whatever ran before it
// — stock taken, lines written, an edit's reversal — so a refusal is
// thrown to roll the transaction back, then handed back as the result.
class SaleRollback {
  constructor(readonly result: unknown) {}
}
async function saleTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await db.$transaction(async (tx) => {
      const result = await fn(tx);
      if (result && typeof result === "object" && (result as { success?: unknown }).success === false) {
        throw new SaleRollback(result);
      }
      return result;
    });
  } catch (err) {
    if (err instanceof SaleRollback) return err.result as T;
    throw err;
  }
}

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
  visitAt: Date,
  discount = 0
): Promise<Result<{ itemTotal: number; grainItems: { id: string; creditAmount: Prisma.Decimal | null }[] }>> {
  let itemTotal = 0;
  const grainItems: { id: string; creditAmount: Prisma.Decimal | null }[] = [];

  // The bill's discount, spread over its lines by amount (rounded to
  // paisa, the last line taking what rounding leaves) — so each line's
  // own figure (line amount − its share) is what it really brought in.
  const grossOf = (i: DailySaleItemInput) => i.quantity * i.actualPrice;
  const grossTotal = items.reduce((sum, i) => sum + grossOf(i), 0);
  if (discount > grossTotal + PAYMENT_SPLIT_EPSILON) {
    return { success: false, error: `The discount (${discount}) can't be more than the bill (${grossTotal}).` };
  }
  let discountLeft = Math.round(discount * 100) / 100;
  const discountShares = items.map((item, index) => {
    if (index === items.length - 1) return discountLeft;
    const share = grossTotal > 0 ? Math.round(((discount * grossOf(item)) / grossTotal) * 100) / 100 : 0;
    discountLeft = Math.round((discountLeft - share) * 100) / 100;
    return share;
  });

  for (const [index, item] of items.entries()) {
    const lineDiscount = discountShares[index];
    const lineNet = grossOf(item) - lineDiscount;
    const product = await tx.product.findFirst({
      where: { id: item.productId, shopId },
      include: { unit: true, subUnit: true },
    });
    if (!product) return { success: false, error: "Product not found" };
    // A two-unit product sold in its small unit (e.g. 7 Kgs out of 50
    // Kg bags): stock and cost are in bags, so convert.
    const sub = product.stockKind === "SIMPLE" && item.unit === "SUB" && subUnitsPerUnit(product) ? true : false;
    const perEntered = sub ? mainUnitsPer(product, "SUB") : 1;
    const mainQuantity = item.quantity * perEntered;

    // SIMPLE stock: a sale is never blocked by stock. It takes what's
    // in hand (stock stops at 0 — anything beyond just counts as sold),
    // and an untracked product (added without a quantity) takes
    // nothing. stockDeducted records exactly what was taken, so an
    // edit/delete puts back exactly that.
    const stockDeducted =
      product.stockKind === "SIMPLE"
        ? product.tracksStock
          ? Math.min(Math.max(Number(product.quantity), 0), mainQuantity)
          : 0
        : null;

    const saleItem = await tx.dailySaleItem.create({
      data: {
        dailySaleId: saleId,
        productId: item.productId,
        quantity: item.quantity,
        stockDeducted,
        actualPrice: item.actualPrice,
        unitName: sub ? product.subUnit!.name : null,
        discount: lineDiscount,
        // Snapshot cost at sale time — only meaningful for SIMPLE
        // stock (grain COGS is derived later from batch rate ×
        // quantity via DailySaleItemBatch, since each batch already
        // permanently records its own rate).
        // Per the unit this line is in (cost is kept per main unit).
        costPriceAtSale: product.stockKind === "SIMPLE" && product.costPrice !== null ? Number(product.costPrice) * perEntered : null,
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
      if (stockDeducted) {
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: { decrement: stockDeducted } },
        });
      }
    } else if (item.fromHomeBatchId) {
      // Grain the shop bought that's still at the seller's home,
      // delivered from there straight to this buyer — never on the
      // shelf. Only what's still at that home can go.
      const home = await tx.grainBatch.findFirst({
        where: { id: item.fromHomeBatchId, productId: product.id, homeCustomerId: { not: null } },
        include: { homeCustomer: true },
      });
      if (!home) return { success: false, error: "That customer's-home grain wasn't found." };
      if (item.quantity > Number(home.quantityAtHome) + 0.0001) {
        return {
          success: false,
          error: `Only ${Number(home.quantityAtHome)} ${product.unit.name} of ${product.name} is still at ${home.homeCustomer?.name ?? "the customer"}'s home.`,
        };
      }
      await tx.grainBatch.update({
        where: { id: home.id },
        data: { quantitySold: { increment: item.quantity }, quantityAtHome: { decrement: item.quantity } },
      });
      await tx.dailySaleItemBatch.create({
        data: { dailySaleItemId: saleItem.id, grainBatchId: home.id, quantity: item.quantity, fromHome: true },
      });
      await postToPooledGrainStock(tx, product.id, -item.quantity, -lineNet);
    } else {
      // Grain: the shop's own stock first, then customers' deposits,
      // oldest batch first within each (shared with grain loans — see
      // drawGrainFifo). Manual batch selection is out of scope.
      await drawGrainFifo(tx, {
        productId: product.id,
        quantity: item.quantity,
        stockUdhaarLink: { linkedSaleId: saleId, visitAt },
        stockUdhaarNote: `Sold from ${product.name} deposit before settlement`,
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
        beforeTake: async (batch) => {
          if (batch.rate !== null) return;
          const override = item.batchRateOverrides?.[batch.id];
          if (override !== undefined) {
            await tx.grainBatch.update({ where: { id: batch.id }, data: { rate: override } });
          }
        },
        onTake: async (grainBatchId, quantity) => {
          await tx.dailySaleItemBatch.create({
            data: { dailySaleItemId: saleItem.id, grainBatchId, quantity },
          });
        },
      });

      // A grain sale is never blocked by stock (same as SIMPLE): any
      // quantity drawGrainFifo couldn't cover is just sold —
      // it draws from no batch, so it has no batch allocation (an
      // edit/delete only puts back what the batches gave) and no cost.

      // Pooled stock: deduct the quantity sold and the full sale
      // REVENUE (not cost — deliberate, see postToPooledGrainStock's
      // comment), regardless of how many batches the FIFO loop above
      // actually drew from.
      await postToPooledGrainStock(tx, product.id, -item.quantity, -lineNet);
    }

    itemTotal += lineNet;
  }

  return { success: true, data: { itemTotal, grainItems } };
}

// Cancels the Stock Udhaar a sale (or one visit of it) still has
// outstanding, with compensating entries — never deletes (see
// reverseSaleContents). Cancels the NET per depositor and batch, not
// every growth entry: a sale's growth may already have been cancelled
// once (an edit, or one of its visits deleted), and cancelling it again
// would leave the depositor with a phantom negative shortfall.
async function reverseSaleStockUdhaar(
  tx: Prisma.TransactionClient,
  link: { linkedSaleId: string; visitAt?: Date },
  notes: string
) {
  const entries = await tx.stockUdhaarEntry.findMany({ where: link });
  const net = new Map<string, { customerId: string; productId: string; grainBatchId: string; quantity: number }>();
  for (const e of entries) {
    const key = `${e.customerId}:${e.grainBatchId}`;
    const cur = net.get(key) ?? { customerId: e.customerId, productId: e.productId, grainBatchId: e.grainBatchId, quantity: 0 };
    cur.quantity += Number(e.quantity);
    net.set(key, cur);
  }
  for (const e of net.values()) {
    if (e.quantity <= 0.0001) continue;
    await tx.stockUdhaarEntry.create({
      data: { ...e, quantity: -Math.round(e.quantity * 1000) / 1000, ...link, notes },
    });
  }
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
            visitAt,
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
          visitAt,
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
  // Goods returned from it are tied to its lines — undo the return first.
  if (await tx.saleReturn.findFirst({ where: { dailySaleId: saleId } })) {
    return { success: false, error: "This sale has a return recorded against it — delete the return first (Returns page)." };
  }

  for (const item of sale.items) {
    const product = await tx.product.findFirst({ where: { id: item.productId } });
    if (!product) continue; // product may have been deleted since; nothing to restore it to

    if (product.stockKind === "SIMPLE") {
      // Put back only what this line actually took (see applySaleItems).
      const restore = item.stockDeducted !== null ? Number(item.stockDeducted) : Number(item.quantity);
      if (restore > 0) {
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: { increment: restore } },
        });
      }
    } else {
      for (const allocation of item.batchAllocations) {
        await tx.grainBatch.update({
          where: { id: allocation.grainBatchId },
          // Delivered from a customer's home: it goes back to being there.
          data: {
            quantitySold: { decrement: allocation.quantity },
            ...(allocation.fromHome ? { quantityAtHome: { increment: allocation.quantity } } : {}),
          },
        });
      }
      // Symmetric undo of the pooled-stock posting applySaleItems
      // made for this item — exact negation, same revenue-based
      // (not cost-based) figure.
      await postToPooledGrainStock(
        tx,
        product.id,
        Number(item.quantity),
        Number(item.actualPrice) * Number(item.quantity) - Number(item.discount)
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
  await reverseSaleStockUdhaar(tx, { linkedSaleId: saleId }, "Reversed — sale edited/deleted");

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

  // Whole-sale edit/delete collapses or removes every visit this
  // DailySale had — see updateDailySale's comment on why it always
  // writes ONE fresh visit regardless of how many existed before.
  // Every Receipt row pointing at this sale's (now-gone) visits is
  // therefore strictly dangling; updateDailySale/deleteDailySale each
  // create at most one fresh Receipt afterward in its own right (or
  // none, for delete), never by resurrecting one of these.
  await tx.receipt.deleteMany({ where: { dailySaleId: saleId } });

  return { success: true, data: { customerId: sale.customerId, dealerId: sale.dealerId, season: sale.season } };
}

// Visit-scoped sibling of reverseSaleContents above — undoes exactly
// ONE visit's effects (one receipt), leaving every OTHER same-day
// visit on the same DailySale completely untouched. This exists
// specifically because reverseSaleContents operates on the whole
// DailySale (every query filters by linkedSaleId/dailySaleId alone,
// with no visit awareness) — reusing it for a single receipt's edit/
// delete would silently destroy or merge any other receipt that
// customer/dealer has from the same day. See Receipt's schema comment
// and AccountTransaction.visitAt's comment for the column additions
// that make this precise rather than a guess.
//
// Refuses outright if any row this visit needs to reverse has
// visitAt: null — a sale recorded before this column existed has no
// reliable way to tell which of its rows belong to which visit, so
// guessing would risk reversing another visit's data; the shopkeeper
// is told to use the whole-day edit/delete from Daily Sales instead
// for those older sales.
async function reverseVisitContents(
  tx: Prisma.TransactionClient,
  shopId: string,
  dailySaleId: string,
  visitAt: Date,
  // deleteReceipt passes true (nothing will be written back, so an
  // emptied DailySale should disappear, mirroring deleteDailySale's
  // own final step). updateReceipt passes false — it's about to
  // reapply fresh items/payments into this SAME dailySaleId right
  // after calling this, so deleting the row here would break that
  // very next write.
  deleteEmptySale: boolean
): Promise<Result<{ customerId: string | null; dealerId: string | null; itemIds: string[] }>> {
  const sale = await tx.dailySale.findFirst({
    where: { id: dailySaleId, shopId },
  });
  if (!sale) return { success: false, error: "Sale not found" };
  if (await tx.saleReturn.findFirst({ where: { dailySaleId, visitAt } })) {
    return { success: false, error: "This bill has a return recorded against it — delete the return first (Returns page)." };
  }

  const items = await tx.dailySaleItem.findMany({
    where: { dailySaleId, visitAt },
    include: { batchAllocations: true },
  });
  if (items.length === 0) {
    return { success: false, error: "Receipt not found" };
  }

  // Pre-migration rows (visitAt: null) anywhere this visit touched
  // can't be safely attributed — refuse rather than guess. Items
  // themselves are always matched exactly above (visitAt is NOT
  // NULL on DailySaleItem), so this only needs to check the three
  // newly-added nullable columns.
  const [ambiguousAccountTxn, ambiguousDealerTxn, ambiguousStockUdhaar] = await Promise.all([
    tx.accountTransaction.findFirst({ where: { linkedSaleId: dailySaleId, visitAt: null } }),
    tx.dealerTransaction.findFirst({ where: { linkedSaleId: dailySaleId, visitAt: null } }),
    tx.stockUdhaarEntry.findFirst({ where: { linkedSaleId: dailySaleId, visitAt: null, quantity: { gt: 0 } } }),
  ]);
  if (ambiguousAccountTxn || ambiguousDealerTxn || ambiguousStockUdhaar) {
    return {
      success: false,
      error:
        "This sale has activity recorded before per-receipt tracking existed — it can't be edited or deleted as a single receipt. Edit or delete the whole day's sale from Daily Sales instead.",
    };
  }

  for (const item of items) {
    const product = await tx.product.findFirst({ where: { id: item.productId } });
    if (!product) continue; // product may have been deleted since; nothing to restore it to

    if (product.stockKind === "SIMPLE") {
      // Put back only what this line actually took (see applySaleItems).
      const restore = item.stockDeducted !== null ? Number(item.stockDeducted) : Number(item.quantity);
      if (restore > 0) {
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: { increment: restore } },
        });
      }
    } else {
      for (const allocation of item.batchAllocations) {
        await tx.grainBatch.update({
          where: { id: allocation.grainBatchId },
          // Delivered from a customer's home: it goes back to being there.
          data: {
            quantitySold: { decrement: allocation.quantity },
            ...(allocation.fromHome ? { quantityAtHome: { increment: allocation.quantity } } : {}),
          },
        });
      }
      await postToPooledGrainStock(
        tx,
        product.id,
        Number(item.quantity),
        Number(item.actualPrice) * Number(item.quantity) - Number(item.discount)
      );
    }
  }

  const transactions = await tx.accountTransaction.findMany({
    where: { linkedSaleId: dailySaleId, visitAt },
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
  await tx.accountTransaction.deleteMany({ where: { linkedSaleId: dailySaleId, visitAt } });

  const dealerTransactions = await tx.dealerTransaction.findMany({
    where: { linkedSaleId: dailySaleId, visitAt },
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
  await tx.dealerTransaction.deleteMany({ where: { linkedSaleId: dailySaleId, visitAt } });

  const accountPayments = await tx.dailySalePayment.findMany({
    where: { dailySaleId, visitAt, paymentMethod: "ACCOUNT", bankAccountId: { not: null } },
  });
  for (const payment of accountPayments) {
    await postToBankAccount(tx, payment.bankAccountId!, -Number(payment.amount));
  }
  await tx.dailySalePayment.deleteMany({ where: { dailySaleId, visitAt } });

  await reverseSaleStockUdhaar(tx, { linkedSaleId: dailySaleId, visitAt }, "Reversed — receipt edited/deleted");

  const itemIds = items.map((i) => i.id);

  const existingPayment = await tx.grainSaleCreditPayment.findFirst({
    where: { dailySaleItemId: { in: itemIds } },
  });
  if (existingPayment) {
    return {
      success: false,
      error: "This receipt has a recorded Udhaar repayment against one of its grain items — it can't be edited or deleted while that payment history exists.",
    };
  }

  await tx.dailySaleItemBatch.deleteMany({ where: { dailySaleItemId: { in: itemIds } } });
  await tx.dailySaleItem.deleteMany({ where: { dailySaleId, visitAt } });
  await tx.receipt.deleteMany({ where: { dailySaleId, visitAt } });

  // If this was the sale's only visit, remove the now-empty DailySale
  // row too — mirrors deleteDailySale's own final step, so a
  // single-visit sale's receipt-delete leaves nothing behind, same as
  // deleting it from Daily Sales would. Skipped when the caller is
  // about to reapply into this same row (see deleteEmptySale's
  // comment above).
  if (deleteEmptySale) {
    const remainingItems = await tx.dailySaleItem.count({ where: { dailySaleId } });
    if (remainingItems === 0) {
      await tx.dailySale.delete({ where: { id: dailySaleId } });
    }
  }

  return { success: true, data: { customerId: sale.customerId, dealerId: sale.dealerId, itemIds } };
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

  return saleTransaction(async (tx) => {
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
    const itemsResult = await applySaleItems(tx, shopId, sale.id, data.items, visitAt, data.discount ?? 0);
    if (!itemsResult.success) return itemsResult;
    const { itemTotal, grainItems } = itemsResult.data;

    const paymentResult = await applyPaymentSplit(tx, shopId, buyer, sale.id, itemTotal, data.payments, visitAt, grainItems);
    if (!paymentResult.success) return paymentResult;

    // One Receipt row per visit — see Receipt's schema comment. The
    // sequential number is a per-shop MAX+1, computed inside this same
    // transaction so two concurrent sales can't land on the same
    // number (Postgres serializes the two transactions' writes to the
    // same shopId row range; a genuine race just makes the loser's
    // transaction retry at the Prisma/driver level like any other
    // write conflict, never produces a duplicate number, since
    // @@unique([shopId, receiptNumber]) would reject it outright if
    // that somehow happened).
    const lastReceipt = await tx.receipt.findFirst({
      where: { shopId },
      orderBy: { receiptNumber: "desc" },
    });
    const receipt = await tx.receipt.create({
      data: {
        shopId,
        receiptNumber: (lastReceipt?.receiptNumber ?? 0) + 1,
        dailySaleId: sale.id,
        visitAt,
      },
    });

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
        receiptNumber: receipt.receiptNumber,
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

  try {
    return await saleTransaction(async (tx) => {
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
      const itemsResult = await applySaleItems(tx, shopId, data.saleId, data.items, visitAt, data.discount ?? 0);
      if (!itemsResult.success) return itemsResult;
      const { itemTotal, grainItems } = itemsResult.data;

      const paymentResult = await applyPaymentSplit(tx, shopId, buyer, data.saleId, itemTotal, data.payments, visitAt, grainItems);
      if (!paymentResult.success) return paymentResult;

      // This collapses whatever receipts the day had (possibly more
      // than one) into a single edited visit — there's no principled
      // "same number" to preserve across a many-to-one collapse like
      // there is for updateReceipt's true single-visit edit, so this
      // always gets a fresh number, same MAX+1 pattern createDailySale
      // uses.
      const lastReceipt = await tx.receipt.findFirst({
        where: { shopId },
        orderBy: { receiptNumber: "desc" },
      });
      await tx.receipt.create({
        data: {
          shopId,
          receiptNumber: (lastReceipt?.receiptNumber ?? 0) + 1,
          dailySaleId: data.saleId,
          visitAt,
        },
      });

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
  } catch (err) {
    // Same reasoning as deleteDailySale's own catch — either the
    // reverse step's bank-reversal or the reapply step's new payment
    // can throw postToBankAccount's overdraft guard, and that must
    // surface as a real message, not Next.js's production-redacted
    // digest box.
    return { success: false, error: err instanceof Error ? err.message : "Failed to update sale" };
  }
}

// Deletes a past sale entirely — reverses every stock/batch/ledger
// effect it caused, then removes the DailySale row itself (the one
// place that final delete happens — see reverseSaleContents). Same
// guarantee as updateDailySale: any failure rolls back the whole
// thing, so a sale is never left half-deleted.
export async function deleteDailySale(saleId: string) {
  const shopId = await getCurrentShopId();

  try {
    return await saleTransaction(async (tx) => {
      const reverseResult = await reverseSaleContents(tx, shopId, saleId);
      if (!reverseResult.success) return reverseResult;
      await tx.dailySale.delete({ where: { id: saleId } });
      return { success: true, data: undefined };
    });
  } catch (err) {
    // reverseSaleContents' bank-reversal call can throw
    // postToBankAccount's overdraft guard — e.g. deleting an old sale
    // whose ACCOUNT payment money has since been spent elsewhere, so
    // there's no longer enough balance to take it back out. Same
    // reasoning as createTransferPurchase/createDepositWithSettlement's
    // own try/catch (stock/actions.ts): this must surface as a real
    // message, not Next.js's production-redacted digest box.
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete sale" };
  }
}

// Edits ONE receipt (one visit) — reverse-then-reapply, same
// correctness-over-surgical-delta approach updateDailySale uses, just
// scoped to a single visit via reverseVisitContents instead of the
// whole day's sale. The edited items/payments are written as a FRESH
// visit (new visitAt), same "edit writes a new visit" precedent
// updateDailySale follows — but the Receipt row keeps its ORIGINAL
// receiptNumber (editing fixes a receipt, it doesn't create a new
// one), only its visitAt moves to match the fresh visit.
export async function updateReceipt(
  input: UpdateReceiptInput
): Promise<
  | { success: true; data: Record<string, unknown> & { receiptNumber: number; visitAt: Date } }
  | { success: false; error: string }
> {
  const shopId = await getCurrentShopId();
  const data = updateReceiptSchema.parse(input);

  try {
    return await saleTransaction(async (tx) => {
      const existingReceipt = await tx.receipt.findFirst({
        where: { dailySaleId: data.dailySaleId, visitAt: data.visitAt, shopId },
      });
      if (!existingReceipt) return { success: false, error: "Receipt not found" };

      const existingSale = await tx.dailySale.findFirstOrThrow({ where: { id: data.dailySaleId, shopId } });
      const reverseResult = await reverseVisitContents(tx, shopId, data.dailySaleId, data.visitAt, false);
      if (!reverseResult.success) return reverseResult;

      const visitAt = new Date();
      const buyer = existingSale.customerId
        ? { customerId: existingSale.customerId }
        : { dealerId: existingSale.dealerId! };
      const itemsResult = await applySaleItems(tx, shopId, data.dailySaleId, data.items, visitAt, data.discount ?? 0);
      if (!itemsResult.success) return itemsResult;
      const { itemTotal, grainItems } = itemsResult.data;

      const paymentResult = await applyPaymentSplit(
        tx,
        shopId,
        buyer,
        data.dailySaleId,
        itemTotal,
        data.payments,
        visitAt,
        grainItems
      );
      if (!paymentResult.success) return paymentResult;

      // reverseVisitContents already deleted the old Receipt row (it
      // cleans up every row belonging to the visit it just reversed,
      // same as it does for deleteReceipt) — a fresh one is created
      // here instead of updated, reusing the SAME receiptNumber (see
      // this function's own comment on why editing keeps its number)
      // but pointing at the new visitAt the reapply step just wrote.
      await tx.receipt.create({
        data: {
          shopId,
          receiptNumber: existingReceipt.receiptNumber,
          dailySaleId: data.dailySaleId,
          visitAt,
        },
      });

      const updated = await tx.dailySale.findUniqueOrThrow({
        where: { id: data.dailySaleId },
        include: { items: { where: { visitAt } } },
      });

      return {
        success: true,
        data: {
          ...updated,
          items: updated.items.map(serializeDecimals),
          receiptNumber: existingReceipt.receiptNumber,
          visitAt,
        },
      };
    });
  } catch (err) {
    // Same reasoning as updateDailySale/deleteDailySale's own catch —
    // the reverse step's bank-reversal or the reapply step's new
    // payment can throw postToBankAccount's overdraft guard, which
    // must surface as a real message, not the production-redacted
    // digest box.
    return { success: false, error: err instanceof Error ? err.message : "Failed to update receipt" };
  }
}

// Deletes ONE receipt (one visit) — any other same-day visit on the
// same DailySale is left completely untouched. If this was the only
// visit, the DailySale row itself is removed too (see
// reverseVisitContents' deleteEmptySale parameter).
export async function deleteReceipt(
  dailySaleId: string,
  visitAt: Date
): Promise<{ success: true; data: undefined } | { success: false; error: string }> {
  const shopId = await getCurrentShopId();

  try {
    return await saleTransaction(async (tx) => {
      const reverseResult = await reverseVisitContents(tx, shopId, dailySaleId, visitAt, true);
      if (!reverseResult.success) return reverseResult;
      return { success: true, data: undefined };
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete receipt" };
  }
}

// Deletes ONE visit of a sale — what every list's Delete on a sale row
// means. A customer's same-day visits share one DailySale, so deleting
// the whole DailySale (deleteDailySale) from a single row would also
// wipe their other visits that day. When the sale has only this one
// visit, it's deleted whole instead (same result, and it also covers
// older sales whose ledger rows predate per-visit tracking).
export async function deleteSaleVisit(
  dailySaleId: string,
  visitAt: Date
): Promise<{ success: true; data: undefined } | { success: false; error: string }> {
  const shopId = await getCurrentShopId();
  const visits = await db.dailySaleItem.findMany({
    where: { dailySaleId, dailySale: { shopId } },
    select: { visitAt: true },
    distinct: ["visitAt"],
  });
  if (visits.length === 0) return { success: false, error: "Sale not found" };
  if (visits.length === 1) {
    const result = await deleteDailySale(dailySaleId);
    return "error" in result ? { success: false, error: result.error } : { success: true, data: undefined };
  }
  return deleteReceipt(dailySaleId, visitAt);
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

  const [sales, clearances, udhaarGiven, shopGrain, shopCleared, shopLedgers] = await Promise.all([
    db.dailySale.findMany({
      where: { customerId, shopId },
      include: {
        items: {
          include: {
            product: { include: { unit: true } },
            // Delivered straight from a seller's home — whose.
            batchAllocations: { where: { fromHome: true }, include: { grainBatch: { include: { homeCustomer: true } } } },
          },
        },
        payments: true,
      },
      orderBy: { saleDate: "desc" },
    }),
    // Excludes isShopBorrowed (shown on the Udhaar to Shop tab
    // instead) and linkedProductId (a payGrainDebt repayment — shop
    // paying the CUSTOMER back for grain, the opposite direction from
    // a customer clearing their OWN Udhaar — shown on the Grain tab
    // instead), so neither leaks into this customer-owes-shop
    // clearance feed.
    db.accountTransaction.findMany({
      where: {
        direction: "IN",
        isShopBorrowed: false,
        linkedProductId: null,
        // A row with a quantity is the shop paying the customer for
        // grain — listed as a Shop row (shopGrain below), not here.
        quantity: null,
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
        // A row with a quantity is the shop BUYING grain from the
        // customer — listed as a Shop row (shopGrain below), not as
        // Udhaar the customer owes.
        quantity: null,
        customerAccount: { customerId, customer: { shopId } },
      },
      orderBy: { transactionDate: "desc" },
    }),
    // The shop's own grain dealings with this customer — buying their
    // grain (OUT with a quantity and its grain batch) and paying them
    // for grain bought earlier on Udhaar (IN with a quantity). Shown in
    // the same history, marked "Shop", so it's clear which way it went.
    db.accountTransaction.findMany({
      where: {
        isShopBorrowed: false,
        quantity: { not: null },
        customerAccount: { customerId, customer: { shopId } },
      },
      include: {
        linkedGrainBatch: { include: { product: { include: { unit: true } } } },
        linkedProduct: true,
      },
      orderBy: { transactionDate: "desc" },
    }),
    // The shop paying this customer back (Udhaar clearance, shop side)
    // — the mirror of the customer's own "Udhaar Cleared" rows above.
    db.accountTransaction.findMany({
      where: { isShopBorrowed: true, direction: "IN", customerAccount: { customerId, customer: { shopId } } },
      orderBy: { transactionDate: "desc" },
    }),
    // For each Udhaar grain purchase's current paid/remaining.
    loadShopOwesCustomer(shopId, customerId),
  ]);
  const shopCharges = shopLedgers.get(customerId)?.charges ?? [];

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
        unitName: item.unitName ?? item.product.unit.name,
        // The seller whose home this grain was delivered from, if any.
        fromHomeOf: (() => {
          const home = item.batchAllocations[0]?.grainBatch.homeCustomer;
          return home ? { id: home.id, name: home.name } : null;
        })(),
      }));
      const discount = visitItems.reduce((sum, i) => sum + Number(i.discount), 0);
      return {
        visitAt: new Date(time),
        items,
        payments: visitPayments.map((p) => ({
          paymentMethod: p.paymentMethod,
          amount: Number(p.amount),
        })),
        discount,
        // What the bill came to after its discount.
        total: items.reduce((sum, i) => sum + i.quantity * i.actualPrice, 0) - discount,
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
    bankAccountId: txn.bankAccountId,
    dueDate: txn.dueDate,
    notes: txn.notes,
  }));

  const udhaarGivenEntries = udhaarGiven.map((txn) => ({
    kind: "UDHAAR_GIVEN" as const,
    id: txn.id,
    saleDate: txn.transactionDate,
    amount: Number(txn.amount),
    paymentMethod: txn.paymentMethod,
    bankAccountId: txn.bankAccountId,
    dueDate: txn.dueDate,
    reference: txn.reference,
    notes: txn.notes,
  }));

  const shopGrainEntries = shopGrain.map((txn) => ({
    kind: "SHOP_GRAIN" as const,
    id: txn.id,
    saleDate: txn.transactionDate,
    // OUT = shop bought grain from the customer; IN = shop paid them
    // for grain bought earlier on Udhaar.
    direction: txn.direction,
    amount: Number(txn.amount),
    paymentMethod: txn.paymentMethod,
    productId: txn.linkedGrainBatch?.productId ?? txn.linkedProductId ?? null,
    productName: txn.linkedGrainBatch?.product.name ?? txn.linkedProduct?.name ?? null,
    quantity: txn.direction === "OUT" ? Number(txn.quantity) : null,
    unitName: txn.linkedGrainBatch?.product.unit.name ?? null,
    rate: txn.linkedGrainBatch?.rate != null ? Number(txn.linkedGrainBatch.rate) : 0,
    bankAccountId: txn.bankAccountId,
    dueDate: null,
    notes: txn.notes,
    // Udhaar grain purchases only: what the shop still owes on it
    // after its pooled repayments (oldest first).
    remaining: shopCharges.find((c) => c.id === txn.id)?.remaining ?? null,
  }));

  const shopClearedEntries = shopCleared.map((txn) => ({
    kind: "SHOP_UDHAAR_CLEARED" as const,
    id: txn.id,
    saleDate: txn.transactionDate,
    amount: Number(txn.amount),
    paymentMethod: txn.paymentMethod,
    bankAccountId: txn.bankAccountId,
    dueDate: null,
    notes: txn.notes,
  }));

  return [...saleEntries, ...clearanceEntries, ...udhaarGivenEntries, ...shopGrainEntries, ...shopClearedEntries].sort(
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
// Udhaar" rows, both shop-wide (Debts page) and per-customer (customer
// detail page, Udhaar clearance). productId powers the Debts page's
// product filter.
//
// Paid/remaining are NOT tracked per item: the customer pays one total
// against all their Udhaar, spread oldest entry first (see
// debts/udhaarLedger.ts). An item's share is its sale's Udhaar charge's
// paid fraction — e.g. a charge 60% cleared shows each of its grain
// items 60% paid. includePaid keeps fully-paid items (the customer's
// Grain tab shows them as "Paid"); everywhere else lists only what's
// still owed.
export async function getCustomerGrainCreditPurchases(
  customerId?: string,
  productId?: string,
  options?: { includePaid?: boolean }
) {
  const shopId = await getCurrentShopId();

  const [items, ledgers] = await Promise.all([
    db.dailySaleItem.findMany({
      where: {
        creditAmount: { not: null },
        productId: productId || undefined,
        product: { shopId, stockKind: "GRAIN" },
        // Scoped to CUSTOMER sales only — a dealer sale's Credit posts
        // to DealerAccount instead (see applyPaymentSplit), not this
        // Customer Udhaar view.
        dailySale: { customerId: customerId ? customerId : { not: null }, shopId },
      },
      include: {
        product: { include: { unit: true } },
        dailySale: { include: { customer: true } },
      },
      orderBy: { visitAt: "desc" },
    }),
    loadCustomerUdhaar(shopId, customerId),
  ]);

  // Same week-long grace period the Udhaar page's overdue flag uses
  // (GRACE_PERIOD_DAYS) — one definition of "overdue" everywhere.
  const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return items
    .map((item) => {
      const borrowed = Number(item.creditAmount);
      // The query above already scopes to customerId: { not: null }.
      const ledger = ledgers.get(item.dailySale.customerId!);
      const charge = ledger?.charges.find(
        (c) =>
          c.linkedSaleId === item.dailySaleId && (!c.visitAt || c.visitAt.getTime() === item.visitAt.getTime())
      );
      // No charge left at all means the sale's Udhaar was fully
      // reversed or cleared — nothing is owed on it.
      const paidFraction = charge && charge.amount > 0 ? charge.paid / charge.amount : 1;
      const paid = Math.round(borrowed * paidFraction * 100) / 100;
      const remaining = Math.round((borrowed - paid) * 100) / 100;
      return {
        dailySaleItemId: item.id,
        dailySaleId: item.dailySaleId,
        customerId: item.dailySale.customerId!,
        customerName: item.dailySale.customer!.name,
        productId: item.productId,
        productName: item.product.name,
        unitName: item.product.unit.name,
        quantity: Number(item.quantity),
        rate: Number(item.actualPrice),
        purchaseDate: item.visitAt,
        dueDate: item.creditDueDate,
        isOverdue:
          remaining > 0.01 && item.creditDueDate !== null && item.creditDueDate.getTime() + GRACE_PERIOD_MS < now,
        borrowed,
        paid,
        remaining,
        status: (remaining <= 0.01 ? "PAID" : paid > 0.01 ? "PARTLY_PAID" : "OPEN") as "PAID" | "PARTLY_PAID" | "OPEN",
      };
    })
    .filter((row) => options?.includePaid || row.remaining > 0.01);
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

// Reverses a legacy per-row grain-credit repayment (recorded before
// grain Udhaar moved onto the customer's pooled Udhaar ledger — see
// debts/udhaarLedger.ts): undoes its bank posting (if ACCOUNT), then
// removes the row. Kept only so the Bank Accounts history can still
// delete such a row; no new ones are created.
export async function deleteGrainSaleItemCreditPayment(
  id: string
): Promise<{ success: false; error: string } | { success: true; data: undefined }> {
  const shopId = await getCurrentShopId();

  const payment = await db.grainSaleCreditPayment.findFirst({
    where: { id, dailySaleItem: { product: { shopId } } },
  });
  if (!payment) return { success: false, error: "Payment not found" };

  try {
    await db.$transaction(async (tx) => {
      if (payment.paymentMethod === "ACCOUNT" && payment.bankAccountId) {
        // The repayment brought money IN — reversing it takes that
        // money back OUT.
        await postToBankAccount(tx, payment.bankAccountId, -Number(payment.amount));
      }
      await tx.grainSaleCreditPayment.delete({ where: { id } });
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete payment" };
  }
  return { success: true, data: undefined };
}

// The edit form's data source for one sale — same shape
// getCustomerPurchaseHistory's per-sale entries use, so the edit
// modal can be pre-filled with exactly what's already there.
export async function getDailySaleForEdit(saleId: string) {
  const shopId = await getCurrentShopId();

  const sale = await db.dailySale.findFirst({
    where: { id: saleId, shopId },
    include: { items: { include: { product: true, batchAllocations: true } }, payments: true },
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
      unit: (item.unitName ? "SUB" : "MAIN") as "MAIN" | "SUB",
      creditAmount: item.creditAmount !== null ? Number(item.creditAmount) : undefined,
      creditDueDate: item.creditDueDate ? toLocalDateString(item.creditDueDate) : undefined,
      fromHomeBatchId: item.batchAllocations.find((a) => a.fromHome)?.grainBatchId,
    })),
    payments: {
      cash: paymentsByMethod.CASH ?? 0,
      account: paymentsByMethod.ACCOUNT ?? 0,
      credit: paymentsByMethod.CREDIT ?? 0,
      bankAccountId: accountPayment?.bankAccountId ?? undefined,
    },
    discount: sale.items.reduce((sum, item) => sum + Number(item.discount), 0),
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

function paymentSummaryFor(payments: { paymentMethod: "CASH" | "ACCOUNT" | "CREDIT" }[]): "CASH" | "ACCOUNT" | "CREDIT" | "MIXED" | null {
  const methods = new Set(payments.map((p) => p.paymentMethod));
  if (methods.size === 0) return null;
  if (methods.size > 1) return "MIXED";
  return payments[0].paymentMethod;
}

// The Receipts page's day list — one row per receipt (one visit),
// brief enough for a scannable table: who, how many items, total,
// how it was paid. Reads Receipt directly (not listDailySales, which
// is whole-DailySale-scoped and has no visit awareness — see
// Receipt's schema comment) so this is exact even on a day where a
// customer made two separate visits.
export async function listReceiptsForDate(dateStr: string) {
  const shopId = await getCurrentShopId();
  const start = parseLocalDateStart(dateStr);
  const end = parseLocalDateEnd(dateStr);

  const receipts = await db.receipt.findMany({
    where: { shopId, visitAt: { gte: start, lte: end } },
    include: {
      dailySale: {
        include: { customer: true, dealer: true },
      },
    },
    orderBy: { visitAt: "desc" },
  });

  // One extra round trip for items/payments, scoped to exactly the
  // visits this page needs (not every visit the underlying DailySale
  // rows ever had) — same reasoning listDailySales' comment gives for
  // why it doesn't eagerly load every relation.
  const results = await Promise.all(
    receipts.map(async (receipt) => {
      const [items, payments] = await Promise.all([
        db.dailySaleItem.count({ where: { dailySaleId: receipt.dailySaleId, visitAt: receipt.visitAt } }),
        db.dailySalePayment.findMany({
          where: { dailySaleId: receipt.dailySaleId, visitAt: receipt.visitAt },
        }),
      ]);
      const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      return {
        receiptNumber: receipt.receiptNumber,
        dailySaleId: receipt.dailySaleId,
        visitAt: receipt.visitAt,
        buyerKind: receipt.dailySale.customerId ? ("CUSTOMER" as const) : ("DEALER" as const),
        buyerId: receipt.dailySale.customerId ?? receipt.dailySale.dealerId!,
        buyerName: receipt.dailySale.customer?.name ?? receipt.dailySale.dealer?.name ?? "Unknown",
        itemCount: items,
        total,
        paymentSummary: paymentSummaryFor(payments),
      };
    })
  );

  return results;
}

// Full detail for ONE receipt — every item, the full payment split,
// buyer info, receipt number, and date/time. Scoped by the
// (dailySaleId, visitAt) pair, since that's a receipt's real
// identity (see Receipt's schema comment) — a bare dailySaleId alone
// could match more than one visit.
export async function getReceiptDetail(dailySaleId: string, visitAt: Date) {
  const shopId = await getCurrentShopId();

  const receipt = await db.receipt.findFirst({
    where: { dailySaleId, visitAt, shopId },
    include: {
      dailySale: {
        include: { customer: true, dealer: true },
      },
    },
  });
  if (!receipt) return null;

  const [items, payments] = await Promise.all([
    db.dailySaleItem.findMany({
      where: { dailySaleId, visitAt },
      include: { product: { include: { unit: true } }, batchAllocations: true },
    }),
    db.dailySalePayment.findMany({
      where: { dailySaleId, visitAt },
      include: { bankAccount: true },
    }),
  ]);

  return {
    receiptNumber: receipt.receiptNumber,
    dailySaleId,
    visitAt,
    buyerKind: receipt.dailySale.customerId ? ("CUSTOMER" as const) : ("DEALER" as const),
    buyerId: receipt.dailySale.customerId ?? receipt.dailySale.dealerId!,
    buyerName: receipt.dailySale.customer?.name ?? receipt.dailySale.dealer?.name ?? "Unknown",
    season: receipt.dailySale.season,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      quantity: Number(item.quantity),
      actualPrice: Number(item.actualPrice),
      // The unit this line was sold in (a two-unit product's small unit,
      // or the product's own unit).
      unit: (item.unitName ? "SUB" : "MAIN") as "MAIN" | "SUB",
      unitName: item.unitName ?? item.product.unit.name,
      creditAmount: item.creditAmount ? Number(item.creditAmount) : null,
      // Delivered straight from a customer's home (that purchase's batch).
      fromHomeBatchId: item.batchAllocations.find((a) => a.fromHome)?.grainBatchId,
    })),
    payments: payments.map((p) => ({
      paymentMethod: p.paymentMethod,
      amount: Number(p.amount),
      bankAccountId: p.bankAccountId,
      bankAccountName: p.bankAccount?.name ?? null,
    })),
    // Items before the discount, the discount, and what the bill came to.
    subtotal: items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.actualPrice), 0),
    discount: items.reduce((sum, i) => sum + Number(i.discount), 0),
    total: items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.actualPrice) - Number(i.discount), 0),
  };
}

export type LastPrice = { price: number; unit: "MAIN" | "SUB"; date: Date };

// The price this customer (or dealer) paid the last time they bought
// each product — so a new sale opens at their own rate, not the
// catalog price (each buyer can have a different rate). The latest
// sale line wins, so a price changed on a sale becomes the next
// time's price by itself.
export async function getLastPrices(buyer: { customerId?: string; dealerId?: string }): Promise<Record<string, LastPrice>> {
  const shopId = await getCurrentShopId();
  if (!buyer.customerId && !buyer.dealerId) return {};
  const items = await db.dailySaleItem.findMany({
    where: {
      dailySale: {
        shopId,
        ...(buyer.customerId ? { customerId: buyer.customerId } : { dealerId: buyer.dealerId }),
      },
    },
    orderBy: { visitAt: "desc" },
    select: { productId: true, actualPrice: true, unitName: true, visitAt: true },
    take: 2000,
  });
  const last: Record<string, LastPrice> = {};
  for (const item of items) {
    if (last[item.productId]) continue;
    last[item.productId] = {
      price: Number(item.actualPrice),
      unit: item.unitName ? "SUB" : "MAIN",
      date: item.visitAt,
    };
  }
  return last;
}
