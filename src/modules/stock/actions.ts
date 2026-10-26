"use server";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { parseLocalDateStart } from "@/lib/utils";
import { postToBankAccount } from "@/modules/settings/bankAccounts.actions";
import { loadShopOwesCustomer } from "@/modules/debts/udhaarLedger";
import {
  transferPurchaseSchema,
  depositWithSettlementSchema,
  updateGrainSettlementSchema,
  type TransferPurchaseInput,
  type DepositWithSettlementInput,
  type UpdateGrainSettlementInput,
  depositReturnSchema,
  type DepositReturnInput,
  updateDepositReturnSchema,
  type UpdateDepositReturnInput,
} from "./schema";
import { coverDepositFromOwnStock, coverStockUdhaarFromBatch } from "./grainFifo";

type Result<T> = { success: true; data: T } | { success: false; error: string };

// The one shared implementation of "move quantity/money through a
// grain product's pooled stock balance" — see Product.pooledStockValue's
// schema comment for the full semantics. Every purchase (a real,
// priced one — never a rate-less deposit) increments both fields by
// what was paid; every sale decrements both by the quantity sold and
// the REVENUE collected (not its cost) — deliberately not proportional
// to cost, per explicit shopkeeper decision, so pooledStockValue
// tracks "unrecovered investment," not "cost of remaining stock."
// Quantity is never blocked from going negative here — the real
// "not enough stock" check already happens against the GrainBatch
// system in applySaleItems before this is ever called, so by the time
// this runs the sale is already known to be physically possible.
export async function postToPooledGrainStock(
  tx: Prisma.TransactionClient,
  productId: string,
  quantityDelta: number,
  valueDelta: number
) {
  await tx.product.update({
    where: { id: productId },
    data: {
      pooledStockQuantity: { increment: quantityDelta },
      pooledStockValue: { increment: valueDelta },
    },
  });
}

// Reads one grain product's pooled stock balance for display — see
// Product.pooledStockValue's schema comment for the full semantics.
// pooledStockValue is NEVER shown to the user as a raw (possibly
// negative) number: once sales have collected more than was ever put
// in, that's normal/expected ("fully recovered, now in profit"), not
// an error, so a negative balance is reframed here as a positive
// "profit" figure instead — the sign is the only thing distinguishing
// "still recovering investment" from "already in profit."
export async function getPooledGrainStock(productId: string) {
  const shopId = await getCurrentShopId();
  const product = await db.product.findFirst({ where: { id: productId, shopId } });
  if (!product) throw new Error("Product not found");

  // Selling past stock can push the stored quantity below 0 (kept
  // raw so edits/deletes reverse exactly) — shown as 0, like SIMPLE stock.
  const quantity = Math.max(Number(product.pooledStockQuantity), 0);
  const value = Number(product.pooledStockValue);

  return value < 0
    ? { quantity, isProfit: true as const, displayValue: -value }
    : { quantity, isProfit: false as const, displayValue: value };
}

// Shared by createTransferPurchase and createDepositWithSettlement —
// both ultimately mean the same thing: "pay a customer for grain that
// has just become a shop-owned batch, and clear their oldest
// outstanding Stock Udhaar first." Posts the payment directly (NOT
// through recordAccountTransaction), because this uses the OPPOSITE
// balance-sign meaning (OUT = shop owes the customer, decrementing
// balance) from that function's debt convention (OUT = customer owes
// more, incrementing balance) — see recordAccountTransaction's own
// comment. Kept as one implementation so the two call sites can never
// drift into different payment/settlement math.
async function payCustomerForGrain(
  tx: Prisma.TransactionClient,
  shopId: string,
  params: {
    customerId: string;
    productId: string;
    productName: string;
    quantity: number;
    rate: number;
    paymentMethod: "CASH" | "ACCOUNT" | "CREDIT";
    bankAccountId?: string;
    notes?: string;
    reference?: string;
    newShopBatchId: string;
  }
) {
  // Find-or-create the shop's Regular account TYPE first — a brand
  // new shop has none yet (nothing seeds it at signup; see
  // ensureDefaultAccountType's now-stale comment, which assumed a
  // caller that doesn't exist), so this must create it on first use
  // rather than throw, same reasoning as the account find-or-create
  // right below it.
  let regularType = await tx.accountType.findFirst({ where: { shopId, code: "REGULAR" } });
  if (!regularType) {
    regularType = await tx.accountType.create({ data: { shopId, name: "Regular", code: "REGULAR" } });
  }
  let customerAccount = await tx.customerAccount.findFirst({
    where: { customerId: params.customerId, accountTypeId: regularType.id },
  });
  if (!customerAccount) {
    customerAccount = await tx.customerAccount.create({
      data: { customerId: params.customerId, accountTypeId: regularType.id },
    });
  }

  const amount = params.quantity * params.rate;
  const payoutTxn = await tx.accountTransaction.create({
    data: {
      customerAccountId: customerAccount.id,
      direction: "OUT",
      amount,
      quantity: params.quantity,
      paymentMethod: params.paymentMethod,
      bankAccountId: params.bankAccountId,
      // Links this transaction to the exact batch it paid for — lets
      // a per-settlement view (the customer's Grain tab) show this
      // specific purchase's own paid/Udhaar status and date, not just
      // an aggregate across the whole account. See the schema
      // comment on AccountTransaction.linkedGrainBatchId.
      linkedGrainBatchId: params.newShopBatchId,
      notes: params.notes || `Purchased ${params.quantity} ${params.productName} from deposit @ ${params.rate}`,
      reference: params.reference || null,
    },
  });

  // The shop PAID OUT of this bank account, regardless of whether the
  // posting above also touched the customer's ledger balance (CREDIT
  // doesn't move real money yet, so it never reaches here) — paying
  // Cash/Account is real money leaving the account right now.
  if (params.paymentMethod === "ACCOUNT" && params.bankAccountId) {
    await postToBankAccount(tx, params.bankAccountId, -amount);
  }
  // The transaction row above is ALWAYS created, regardless of
  // payment method — Cash Flow's sumCashOut/sumExpensesByMethod read
  // it directly to know real money left the shop, the same way
  // DailySalePayment records every sale regardless of how the buyer
  // paid. But the BALANCE only moves for CREDIT — Cash/Account mean
  // the shopkeeper paid the customer right now, in the same breath as
  // buying the grain, so nothing is left owing (same "settled
  // immediately, no ledger balance" treatment applyPaymentSplit gives
  // the buyer's Cash/Account payments in Daily Sales — see that
  // function's comment). Only CREDIT — "I'm buying this now but
  // paying you later" — leaves a real debt: shop owes the customer,
  // negative balance per describeBalance's convention (positive =
  // customer owes shop, negative = shop owes customer).
  if (params.paymentMethod === "CREDIT") {
    await tx.customerAccount.update({
      where: { id: customerAccount.id },
      data: { currentBalance: { decrement: amount } },
    });
  }

  // Settle outstanding Stock Udhaar for this customer+product,
  // oldest-first, up to the quantity just purchased. Each settlement
  // is a NEGATIVE entry (never a delete — see reverseSaleContents'
  // comment for why the ledger is append-only) so the shortfall's
  // full history stays intact and auditable.
  let remainingToSettle = params.quantity;
  if (remainingToSettle > 0) {
    const outstandingEntries = await tx.stockUdhaarEntry.findMany({
      where: { customerId: params.customerId, productId: params.productId },
      orderBy: { createdAt: "asc" },
    });
    // Running outstanding total per batch this shortfall came from —
    // settle the oldest-growing batches first.
    const outstandingByBatch = new Map<string, number>();
    for (const entry of outstandingEntries) {
      outstandingByBatch.set(
        entry.grainBatchId,
        (outstandingByBatch.get(entry.grainBatchId) ?? 0) + Number(entry.quantity)
      );
    }
    for (const [grainBatchId, outstanding] of outstandingByBatch) {
      if (remainingToSettle <= 0) break;
      if (outstanding <= 0) continue;
      const settleAmount = Math.min(outstanding, remainingToSettle);
      await tx.stockUdhaarEntry.create({
        data: {
          customerId: params.customerId,
          productId: params.productId,
          grainBatchId,
          quantity: -settleAmount,
          linkedTransferBatchId: params.newShopBatchId,
          notes: `Settled by purchase of ${params.productName}`,
        },
      });
      remainingToSettle -= settleAmount;
    }
  }

  return {
    ...payoutTxn,
    amount: Number(payoutTxn.amount),
    quantity: payoutTxn.quantity ? Number(payoutTxn.quantity) : null,
  };
}

// Ownership-transfer/purchase: the shopkeeper buys some or all of a
// customer's already-deposited stock at an agreed rate (Stock
// Management spec, section 4) — for a batch that was stored earlier
// and is only now being settled. This is a pure OWNERSHIP move, not a
// physical one — nothing leaves or enters the shop, since the stock
// was already sitting there. Effects, all in one transaction:
//   1. The source (customer) batch's claim shrinks by `quantity`
//      (quantityTransferred increments) — its PHYSICAL quantitySold is
//      untouched, since this isn't a sale to an outside buyer.
//   2. A NEW shop-owned batch is created for that same quantity, at
//      the agreed rate — this becomes the shop's true cost basis for
//      whatever portion of `quantity` is STILL PHYSICALLY ON THE
//      SHELF (i.e. not already sold via Stock Udhaar) when it's later
//      sold.
//   3. If any portion of `quantity` was ALREADY sold before this
//      settlement (a Stock Udhaar sale — see applySaleItems' comment
//      on why a rate-less customer batch can be sold from at all) and
//      the source batch itself still has no rate, THIS settlement's
//      rate is also backfilled onto the source batch directly — that
//      historical sale's DailySaleItemBatch permanently points at the
//      SOURCE batch, never the new one, so getPnlReport (which reads
//      batch.rate straight off whichever batch an allocation actually
//      references, no snapshot) would otherwise keep reporting that
//      sale's cost as unknown forever, even after the shopkeeper has
//      genuinely settled up. This is the one case the source batch's
//      own rate is ever set — normally it stays null permanently
//      once created, per GrainBatch.rate's schema comment.
//   4. The customer is paid, and any outstanding Stock Udhaar on this
//      product is settled — see payCustomerForGrain above.
// Total physical stock is unchanged throughout — only ownership moved.
// See createDepositWithSettlement for the "selling right at drop-off"
// shortcut, which skips ever creating a customer-owned batch at all.
export async function createTransferPurchase(
  input: TransferPurchaseInput
): Promise<{ success: false; error: string } | { success: true; data: Record<string, unknown> }> {
  const shopId = await getCurrentShopId();
  const data = transferPurchaseSchema.parse(input);

  try {
    return await db.$transaction(async (tx) => {
    const sourceBatch = await tx.grainBatch.findFirst({
      where: { id: data.grainBatchId, product: { shopId } },
      include: { product: true },
    });
    if (!sourceBatch) return { success: false, error: "Batch not found" };
    if (!sourceBatch.ownerCustomerId) {
      return { success: false, error: "Only a customer-deposited batch can be transfer-purchased — this batch is shop-owned." };
    }

    const remainingClaim =
      Number(sourceBatch.quantityIn) - Number(sourceBatch.quantityTransferred) - Number(sourceBatch.quantityReturned);
    if (data.quantity > remainingClaim) {
      return {
        success: false,
        error: `Only ${remainingClaim} ${sourceBatch.product.name} remains as this customer's claim on this batch (requested ${data.quantity}).`,
      };
    }

    await tx.grainBatch.update({
      where: { id: sourceBatch.id },
      data: {
        quantityTransferred: { increment: data.quantity },
        // See point 3 above — only ever fires once, since the source
        // batch's rate is null exactly until the first settlement
        // that touches it (this update is a no-op on every later
        // settlement of the same batch, since the condition below is
        // already false by then).
        ...(sourceBatch.rate === null && Number(sourceBatch.quantitySold) > 0 ? { rate: data.rate } : {}),
      },
    });

    const newShopBatch = await tx.grainBatch.create({
      data: {
        productId: sourceBatch.productId,
        ownerCustomerId: null,
        quantityIn: data.quantity,
        rate: data.rate,
        sourceBatchId: sourceBatch.id,
      },
    });

    const payment = await payCustomerForGrain(tx, shopId, {
      customerId: sourceBatch.ownerCustomerId,
      productId: sourceBatch.productId,
      productName: sourceBatch.product.name,
      quantity: data.quantity,
      rate: data.rate,
      paymentMethod: data.paymentMethod,
      bankAccountId: data.paymentMethod === "ACCOUNT" ? data.bankAccountId : undefined,
      reference: data.reference,
      notes: data.notes,
      newShopBatchId: newShopBatch.id,
    });

    // This is a real, priced purchase (an ownership transfer at an
    // agreed rate) — the pool gains exactly what was paid, same as
    // any other grain purchase. See postToPooledGrainStock's comment.
    await postToPooledGrainStock(tx, sourceBatch.productId, data.quantity, data.quantity * data.rate);

    const updatedSourceBatch = await tx.grainBatch.findUniqueOrThrow({ where: { id: sourceBatch.id } });

    return {
      success: true,
      data: {
        sourceBatch: serializeDecimals(updatedSourceBatch),
        newBatch: serializeDecimals(newShopBatch),
        payment,
      },
    };
    });
  } catch (err) {
    // postToBankAccount's overdraft guard (and any other invariant
    // thrown inside the transaction) must surface as a real message,
    // not Next.js's production-redacted digest box — see
    // src/lib/actionResult.ts's rationale. Caught here instead of
    // converting postToBankAccount itself, since that helper is
    // shared across six modules' $transaction blocks and a throw is
    // what correctly rolls the transaction back.
    return { success: false, error: err instanceof Error ? err.message : "Failed to record purchase" };
  }
}

// The "selling right at drop-off" shortcut (Stock Management spec: a
// customer sometimes wants to sell immediately, not store for later).
// Deliberately does NOT create a customer-owned batch at all — that
// would flash a row into existence for a moment even though it's
// being bought immediately, and would need an extra transfer-purchase
// step right after. Instead this creates the shop-owned batch
// directly and pays the customer in the same transaction —
// functionally equivalent to "deposit, then instantly transfer-
// purchase all of it," just without the intermediate state. This is
// PHYSICALLY a real addition to the shop's stock (unlike a later
// transfer-purchase, where the grain was already sitting there) — the
// grain is arriving for the first time right now.
export async function createDepositWithSettlement(
  input: DepositWithSettlementInput
): Promise<{ success: false; error: string } | { success: true; data: Record<string, unknown> }> {
  const shopId = await getCurrentShopId();
  const data = depositWithSettlementSchema.parse(input);

  try {
    return await db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: data.productId, shopId } });
    if (!product) return { success: false, error: "Product not found" };

    const customer = await tx.customer.findFirst({ where: { id: data.customerId, shopId } });
    if (!customer) return { success: false, error: "Customer not found" };

    const newShopBatch = await tx.grainBatch.create({
      data: {
        productId: data.productId,
        ownerCustomerId: null,
        quantityIn: data.quantity,
        rate: data.rate,
        // No sourceBatchId — there's no customer batch to trace back
        // to, since the deposit and the purchase are the same event
        // here (see createTransferPurchase's sourceBatchId comment
        // for what that field means when it IS set).
      },
    });

    const payment = await payCustomerForGrain(tx, shopId, {
      customerId: data.customerId,
      productId: data.productId,
      productName: product.name,
      quantity: data.quantity,
      rate: data.rate,
      paymentMethod: data.paymentMethod,
      bankAccountId: data.paymentMethod === "ACCOUNT" ? data.bankAccountId : undefined,
      reference: data.reference,
      notes: data.notes,
      newShopBatchId: newShopBatch.id,
    });

    // Real, priced purchase (settle-now at drop-off) — pool gains
    // what was paid, same as createTransferPurchase above.
    await postToPooledGrainStock(tx, data.productId, data.quantity, data.quantity * data.rate);
    // New own grain first gives back any Stock Udhaar still owed.
    await coverStockUdhaarFromBatch(tx, data.productId, newShopBatch.id);

    return {
      success: true,
      data: {
        newBatch: serializeDecimals(newShopBatch),
        payment,
      },
    };
    });
  } catch (err) {
    // Same reasoning as createTransferPurchase's catch above —
    // postToBankAccount's overdraft guard throws inside this
    // transaction and must surface as a real message, not
    // production's redacted digest box.
    return { success: false, error: err instanceof Error ? err.message : "Failed to record purchase" };
  }
}

// Fully reverses a grain settlement — the Bank Accounts page's entry
// point for a "Grain settlement" row (an AccountTransaction with
// linkedGrainBatchId set, created by payCustomerForGrain inside
// createTransferPurchase or createDepositWithSettlement). Undoes
// every effect those two functions cause, in reverse: the pooled
// stock gain, the new shop-owned batch itself, any StockUdhaarEntry
// settlements it cleared, the customer balance move (CREDIT) or bank
// posting (ACCOUNT), and — only for a transfer-purchase, never a
// settle-now deposit, which has no source batch — the source batch's
// quantityTransferred claim.
//
// Blocked outright if any of the new batch's quantity has already
// been SOLD onward (quantitySold > 0) — that stock physically left
// the shop to an end customer, so there is nothing left to safely
// "un-settle"; the shopkeeper would need to handle that sale first.
// Also blocked if it settled any Stock Udhaar shortfall that has
// SINCE been further settled by a LATER purchase (a later settlement
// entry pointing back at this one via linkedTransferBatchId) — undoing
// this one first would leave that later entry's own math inconsistent.
export async function deleteGrainSettlement(accountTransactionId: string): Promise<{ success: false; error: string } | { success: true; data: null }> {
  const shopId = await getCurrentShopId();

  const txn = await db.accountTransaction.findFirst({
    where: { id: accountTransactionId, customerAccount: { customer: { shopId } } },
    include: { linkedGrainBatch: true },
  });
  if (!txn || !txn.linkedGrainBatch) return { success: false, error: "Settlement not found" };

  const newShopBatch = txn.linkedGrainBatch;
  if (Number(newShopBatch.quantitySold) > 0) {
    return {
      success: false,
      error: "Some of this settlement's stock has already been sold — it can't be undone until that's resolved.",
    };
  }

  const laterSettlement = await db.stockUdhaarEntry.findFirst({
    where: { linkedTransferBatchId: newShopBatch.id, createdAt: { gt: txn.transactionDate } },
  });
  if (laterSettlement) {
    return {
      success: false,
      error: "A later settlement depends on this one having happened — it can't be undone out of order.",
    };
  }

  const amount = Number(txn.amount);
  const quantity = Number(txn.quantity ?? newShopBatch.quantityIn);
  const rate = Number(newShopBatch.rate);

  await db.$transaction(async (tx) => {
    // Reverse the pooled-stock gain this settlement added.
    await postToPooledGrainStock(tx, newShopBatch.productId, -quantity, -(quantity * rate));

    // Reverse the customer balance / bank posting payCustomerForGrain
    // made, same conventions as recordAccountTransaction's own
    // reversal (deleteAccountTransaction in customers/actions.ts).
    if (txn.paymentMethod === "CREDIT") {
      await tx.customerAccount.update({
        where: { id: txn.customerAccountId },
        data: { currentBalance: { increment: amount } },
      });
    }
    if (txn.paymentMethod === "ACCOUNT" && txn.bankAccountId) {
      await postToBankAccount(tx, txn.bankAccountId, amount);
    }

    // Reverse whatever Stock Udhaar shortfall this settlement cleared
    // — append-only ledger (see StockUdhaarEntry's own comment), so
    // this adds a compensating POSITIVE entry rather than deleting
    // the negative settlement rows, keeping the full history intact.
    const settlementEntries = await tx.stockUdhaarEntry.findMany({
      where: { linkedTransferBatchId: newShopBatch.id },
    });
    for (const entry of settlementEntries) {
      await tx.stockUdhaarEntry.create({
        data: {
          customerId: entry.customerId,
          productId: entry.productId,
          grainBatchId: entry.grainBatchId,
          quantity: -Number(entry.quantity),
          notes: "Reversed — settlement deleted",
        },
      });
    }

    // If this settlement came from a transfer-purchase (has a source
    // batch), give that claim back; a settle-now deposit has no
    // source batch to restore.
    if (newShopBatch.sourceBatchId) {
      await tx.grainBatch.update({
        where: { id: newShopBatch.sourceBatchId },
        data: { quantityTransferred: { decrement: quantity } },
      });
    }

    // The AccountTransaction and the new shop batch it's linked to
    // are deleted together — the transaction's own cascade would
    // otherwise leave the batch orphaned (linkedGrainBatchId set to
    // something gone).
    await tx.accountTransaction.delete({ where: { id: accountTransactionId } });
    await tx.grainBatch.delete({ where: { id: newShopBatch.id } });
  });

  return { success: true, data: null };
}

// Edits an already-recorded grain settlement, including its quantity
// — implemented as "fully undo, then fully redo with the new numbers"
// rather than patching fields in place, since quantity/rate changes
// ripple into pooled stock, any Stock Udhaar shortfall this
// settlement cleared, and (for a transfer-purchase) the source
// batch's claim — the same effects deleteGrainSettlement already
// knows how to reverse exactly, and createTransferPurchase/
// createDepositWithSettlement already know how to (re)apply exactly.
// Reusing both rather than writing a third copy of this math is the
// whole point: there is still only one implementation of each
// direction, just composed here instead of duplicated.
//
// Same guards as deleteGrainSettlement — refuses if any of the
// settlement's stock has already been sold onward, or a later
// settlement depends on this one — checked BEFORE either half runs,
// so a doomed edit never partially reverses before failing.
export async function updateGrainSettlement(
  input: UpdateGrainSettlementInput
): Promise<{ success: false; error: string } | { success: true; data: Record<string, unknown> }> {
  const shopId = await getCurrentShopId();
  const data = updateGrainSettlementSchema.parse(input);

  const txn = await db.accountTransaction.findFirst({
    where: { id: data.accountTransactionId, customerAccount: { customer: { shopId } } },
    include: { linkedGrainBatch: { include: { product: true } }, customerAccount: true },
  });
  if (!txn || !txn.linkedGrainBatch) return { success: false, error: "Settlement not found" };

  const newShopBatch = txn.linkedGrainBatch;
  const customerId = txn.customerAccount.customerId;
  const productName = newShopBatch.product.name;
  if (Number(newShopBatch.quantitySold) > 0) {
    return {
      success: false,
      error: "Some of this settlement's stock has already been sold — it can't be edited until that's resolved.",
    };
  }
  const laterSettlement = await db.stockUdhaarEntry.findFirst({
    where: { linkedTransferBatchId: newShopBatch.id, createdAt: { gt: txn.transactionDate } },
  });
  if (laterSettlement) {
    return {
      success: false,
      error: "A later settlement depends on this one having happened — it can't be edited out of order.",
    };
  }

  // sourceBatchId distinguishes a transfer-purchase (a customer batch
  // existed already, and its claim must shrink again by the new
  // quantity) from a settle-now deposit (no customer batch, nothing
  // to re-claim against) — same distinction createTransferPurchase
  // vs. createDepositWithSettlement encode as two separate entry
  // points; re-derived here from whichever one originally created
  // this settlement, since editing doesn't change which kind it was.
  const sourceBatchId = newShopBatch.sourceBatchId;
  // The deposit's total after this edit — changed only when a new
  // depositQuantity is given (transfer-purchases only).
  let newDepositQuantity: number | null = null;
  if (sourceBatchId) {
    const sourceBatch = await db.grainBatch.findFirst({ where: { id: sourceBatchId } });
    if (sourceBatch) {
      const depositQuantity = data.depositQuantity ?? Number(sourceBatch.quantityIn);
      // Bought from this deposit by OTHER settlements, and sold from it
      // before it was bought (Stock Udhaar) — neither can be undone by
      // shrinking the deposit.
      const otherSettled = Number(sourceBatch.quantityTransferred) - Number(newShopBatch.quantityIn);
      const soldFromDeposit = Number(sourceBatch.quantitySold);
      // Given back to the customer unsettled — gone, like the above.
      const givenBack = Number(sourceBatch.quantityReturned);
      const remainingClaim = depositQuantity - otherSettled - givenBack;
      if (data.quantity > remainingClaim) {
        return {
          success: false,
          error: `Only ${remainingClaim} of this ${depositQuantity} deposit is left to buy (requested ${data.quantity}).`,
        };
      }
      const minDeposit = Math.max(soldFromDeposit, otherSettled + givenBack + data.quantity);
      if (depositQuantity < minDeposit) {
        return {
          success: false,
          error: `The deposit can't be less than ${minDeposit} — that much of it is already bought or sold.`,
        };
      }
      if (data.depositQuantity !== undefined && data.depositQuantity !== Number(sourceBatch.quantityIn)) {
        newDepositQuantity = data.depositQuantity;
      }
    }
  } else if (data.depositQuantity !== undefined && data.depositQuantity < data.quantity) {
    return { success: false, error: "The deposit can't be less than the quantity bought." };
  }
  // A settle-now entry (deposited and bought at once) given a deposit
  // larger than what was bought becomes "deposited, then partly
  // bought": a customer deposit batch is created for the full amount
  // and this purchase is linked to it, so the rest shows as the
  // customer's unpriced grain — same shape createTransferPurchase
  // leaves behind.
  const splitDeposit =
    !sourceBatchId && data.depositQuantity !== undefined && data.depositQuantity > data.quantity + 0.0001
      ? data.depositQuantity
      : null;

  const oldAmount = Number(txn.amount);
  const oldQuantity = Number(txn.quantity ?? newShopBatch.quantityIn);
  const oldRate = Number(newShopBatch.rate);

  try {
    return await db.$transaction(async (tx) => {
      // Undo half — exactly deleteGrainSettlement's own steps, minus
      // the final two deletes (the row/batch are about to be reused,
      // not removed).
      await postToPooledGrainStock(tx, newShopBatch.productId, -oldQuantity, -(oldQuantity * oldRate));
      if (txn.paymentMethod === "CREDIT") {
        await tx.customerAccount.update({
          where: { id: txn.customerAccountId },
          data: { currentBalance: { increment: oldAmount } },
        });
      }
      if (txn.paymentMethod === "ACCOUNT" && txn.bankAccountId) {
        await postToBankAccount(tx, txn.bankAccountId, oldAmount);
      }
      const settlementEntries = await tx.stockUdhaarEntry.findMany({
        where: { linkedTransferBatchId: newShopBatch.id },
      });
      for (const entry of settlementEntries) {
        await tx.stockUdhaarEntry.create({
          data: {
            customerId: entry.customerId,
            productId: entry.productId,
            grainBatchId: entry.grainBatchId,
            quantity: -Number(entry.quantity),
            notes: "Reversed — settlement edited",
          },
        });
      }
      if (sourceBatchId) {
        await tx.grainBatch.update({
          where: { id: sourceBatchId },
          data: { quantityTransferred: { decrement: oldQuantity } },
        });
      }
      await tx.accountTransaction.delete({ where: { id: data.accountTransactionId } });

      // Redo half — exactly createTransferPurchase's/
      // createDepositWithSettlement's own steps, reusing the SAME
      // shop batch row (updated in place) rather than creating a new
      // one, so its id stays stable across the edit.
      let effectiveSourceId = sourceBatchId;
      if (splitDeposit !== null) {
        const depositBatch = await tx.grainBatch.create({
          data: {
            productId: newShopBatch.productId,
            ownerCustomerId: customerId,
            quantityIn: splitDeposit,
            receivedAt: newShopBatch.receivedAt,
          },
        });
        await tx.grainBatch.update({ where: { id: newShopBatch.id }, data: { sourceBatchId: depositBatch.id } });
        effectiveSourceId = depositBatch.id;
      }
      if (effectiveSourceId) {
        await tx.grainBatch.update({
          where: { id: effectiveSourceId },
          data: {
            quantityTransferred: { increment: data.quantity },
            ...(newDepositQuantity !== null ? { quantityIn: newDepositQuantity } : {}),
          },
        });
      }
      await tx.grainBatch.update({
        where: { id: newShopBatch.id },
        data: { quantityIn: data.quantity, rate: data.rate },
      });

      const payment = await payCustomerForGrain(tx, shopId, {
        customerId,
        productId: newShopBatch.productId,
        productName,
        quantity: data.quantity,
        rate: data.rate,
        paymentMethod: data.paymentMethod,
        bankAccountId: data.paymentMethod === "ACCOUNT" ? data.bankAccountId : undefined,
        reference: data.reference,
        notes: data.notes,
        newShopBatchId: newShopBatch.id,
      });

      await postToPooledGrainStock(tx, newShopBatch.productId, data.quantity, data.quantity * data.rate);

      const updatedBatch = await tx.grainBatch.findUniqueOrThrow({ where: { id: newShopBatch.id } });

      return {
        success: true,
        data: { batch: serializeDecimals(updatedBatch), payment },
      };
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update settlement" };
  }
}

// Everything the full "Edit settlement" form needs: whether this was
// bought from an earlier deposit (a transfer-purchase, whose deposit
// total can also be edited) or deposited-and-bought at once (settle-
// now), the deposit's total, what other settlements already bought
// from it, and what was sold from it before being bought — the floor
// the deposit can't go below.
export async function getGrainSettlementDetails(accountTransactionId: string) {
  const shopId = await getCurrentShopId();
  const txn = await db.accountTransaction.findFirst({
    where: { id: accountTransactionId, customerAccount: { customer: { shopId } } },
    include: { linkedGrainBatch: { include: { sourceBatch: true } } },
  });
  if (!txn?.linkedGrainBatch) return null;
  const batch = txn.linkedGrainBatch;
  const source = batch.sourceBatch;
  const quantity = Number(batch.quantityIn);
  return {
    kind: source ? ("FROM_DEPOSIT" as const) : ("SETTLE_NOW" as const),
    quantity,
    rate: batch.rate !== null ? Number(batch.rate) : 0,
    paymentMethod: txn.paymentMethod,
    bankAccountId: txn.bankAccountId,
    reference: txn.reference,
    depositQuantity: source ? Number(source.quantityIn) : quantity,
    otherSettled: source ? Number(source.quantityTransferred) - quantity : 0,
    soldFromDeposit: source ? Number(source.quantitySold) : 0,
  };
}

// A customer batch's settlement breakdown: every purchase the
// shopkeeper has made against it so far, each as its own entry — NOT
// averaged into one blended rate, since two settlements against the
// same deposit can genuinely happen at different agreed rates (grain
// prices move) and collapsing them would misstate what was actually
// paid each time. Comes from the batch's transferredBatches relation
// — each shop-owned batch a transfer-purchase (or a settle-now
// deposit that later gets more bought against the SAME original
// deposit — not applicable there since settle-now never creates a
// customer batch at all) created FROM this one, which is exactly one
// settlement event, permanently recording its own quantityIn/rate/
// receivedAt, plus its ORIGINAL paymentMethod via
// paymentTransactions[0] (see AccountTransaction.linkedGrainBatchId —
// payCustomerForGrain creates exactly one payment transaction per new
// batch). "paid" reflects what was actually true at settlement time
// (Cash/Account = paid then and there; Credit = Udhaar) — it does NOT
// track whether a Credit settlement has SINCE been paid off via
// payGrainDebt, since that repayment posts against the customer's
// account as a whole, not to one specific settlement; the account-
// level "Shop owes" figure (getShopOwedForGrain) is what stays
// accurate for the current net position. Also returns the still-
// unsettled remainder (the claim), so a partially-settled batch's
// full picture — settled portions plus what's left — is always
// visible together, per the "clearly mention partial settlement"
// requirement.
type SettlementEntry = {
  batchId: string;
  // The AccountTransaction id this settlement's payment posted as —
  // null only for a batch whose payment row somehow doesn't exist
  // (shouldn't happen in practice, since payCustomerForGrain always
  // creates one in the same transaction as the batch) — needed to
  // call deleteGrainSettlement/updateAccountTransaction for this
  // specific settlement, distinct from the batch's own id.
  transactionId: string | null;
  quantity: number;
  rate: number;
  receivedAt: Date;
  paymentMethod: "CASH" | "ACCOUNT" | "CREDIT" | null;
};
function summarizeSettlements(
  batch: { quantityIn: Prisma.Decimal; quantityTransferred: Prisma.Decimal; quantityReturned: Prisma.Decimal },
  transferredBatches: {
    id: string;
    quantityIn: Prisma.Decimal;
    rate: Prisma.Decimal | null;
    receivedAt: Date;
    paymentTransactions: { id: string; paymentMethod: "CASH" | "ACCOUNT" | "CREDIT" }[];
  }[]
) {
  const settlements: SettlementEntry[] = transferredBatches
    .filter((b) => b.rate !== null)
    .map((b) => ({
      batchId: b.id,
      transactionId: b.paymentTransactions[0]?.id ?? null,
      quantity: Number(b.quantityIn),
      rate: Number(b.rate),
      receivedAt: b.receivedAt,
      paymentMethod: b.paymentTransactions[0]?.paymentMethod ?? null,
    }));
  const settledQuantity = settlements.reduce((sum, s) => sum + s.quantity, 0);
  const settledTotalAmount = settlements.reduce((sum, s) => sum + s.quantity * s.rate, 0);
  // Grain given back unsettled is no longer the customer's to settle.
  const returnedQuantity = Number(batch.quantityReturned);
  const unsettledQuantity = Number(batch.quantityIn) - Number(batch.quantityTransferred) - returnedQuantity;
  return { settlements, settledQuantity, settledTotalAmount, unsettledQuantity, returnedQuantity };
}

// Outstanding Stock Udhaar (a QUANTITY obligation, never money) for
// this shop, optionally narrowed to one customer and/or product.
// Sums the signed ledger per customer+product and returns only
// nonzero outstanding shortfalls — settled-to-zero pairs don't show
// up as noise. Powers both a per-customer view (customer detail page)
// and a shop-wide report (reports/actions.ts: getStockUdhaarReport).
export async function getStockUdhaarSummary(customerId?: string, productId?: string) {
  const shopId = await getCurrentShopId();

  const entries = await db.stockUdhaarEntry.findMany({
    where: {
      customer: { shopId },
      customerId: customerId || undefined,
      productId: productId || undefined,
    },
    include: { customer: true, product: { include: { unit: true } } },
  });

  const totals = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      productId: string;
      productName: string;
      unitName: string;
      quantity: number;
    }
  >();
  for (const entry of entries) {
    const key = `${entry.customerId}:${entry.productId}`;
    const existing = totals.get(key);
    const quantity = Number(entry.quantity);
    if (existing) {
      existing.quantity += quantity;
    } else {
      totals.set(key, {
        customerId: entry.customerId,
        customerName: entry.customer.name,
        productId: entry.productId,
        productName: entry.product.name,
        unitName: entry.product.unit.name,
        quantity,
      });
    }
  }

  return Array.from(totals.values()).filter((t) => t.quantity > 0.001);
}

// Shop-wide "how short am I overall" figure — every outstanding Stock
// Udhaar entry summed PER UNIT (kg and Ton can't be added into one
// number), regardless of which customer or product it's against. This
// is deliberately the only place Stock Udhaar is ever summarized to a
// single "shortage" headline — per the "shopkeeper-side concern, never
// shown on a customer's own profile" decision, a customer only ever
// sees their OWN purchase/deposit history, never the shop's aggregate
// exposure across everyone.
// productId optionally scopes the totals to one grain product — the
// Grain page's Shop Udhaar view now has a subtab per product (see
// GrainUdhaarSection), each with its own "how short am I on THIS
// product" stat cards, alongside this same function's shop-wide
// (productId omitted) use for the all-products summary.
export async function getStockUdhaarTotals(productId?: string) {
  const entries = await getStockUdhaarSummary(undefined, productId);

  const byUnit = new Map<string, number>();
  for (const entry of entries) {
    byUnit.set(entry.unitName, (byUnit.get(entry.unitName) ?? 0) + entry.quantity);
  }

  return {
    byUnit: Array.from(byUnit.entries()).map(([unitName, quantity]) => ({ unitName, quantity })),
    customerCount: new Set(entries.map((e) => e.customerId)).size,
  };
}

// Money the shop still owes customers for grain it bought from them on
// Udhaar (a CREDIT grain settlement), per customer. Read off the shop
// ledger (debts/udhaarLedger.ts: loadShopOwesCustomer), where the
// shop's repayments to a customer are one pooled pot spread over
// everything it owes them — borrowed money and grain — oldest first.
// So a grain purchase's "owed" is whatever of it that pot hasn't
// reached yet. productId optionally narrows to one grain product.
export async function getShopOwedForGrain(customerId?: string, productId?: string) {
  const shopId = await getCurrentShopId();
  const ledgers = await loadShopOwesCustomer(shopId, customerId);

  return [...ledgers.values()]
    .map((l) => ({
      customerId: l.customerId,
      customerName: l.customerName,
      amountOwed: l.charges
        .filter((c) => c.kind === "GRAIN" && (!productId || c.productId === productId))
        .reduce((sum, c) => sum + c.remaining, 0),
    }))
    .filter((e) => e.amountOwed > 0.01);
}

// One customer's grain money-owed broken out PER PRODUCT (the Grain
// tab's per-product "Shop owes for this" card), plus each grain
// purchase's own paid/remaining keyed by its AccountTransaction id
// (`settlements`) so every settlement row can show Paid / Partly paid /
// Owed. Same pooled oldest-first figures as getShopOwedForGrain.
export async function getShopOwedForGrainByProduct(customerId: string) {
  const shopId = await getCurrentShopId();
  const ledger = (await loadShopOwesCustomer(shopId, customerId)).get(customerId);

  const byProduct = new Map<
    string,
    { productName: string; owed: number; paid: number; settlements: Record<string, { paid: number; remaining: number }> }
  >();
  for (const c of ledger?.charges ?? []) {
    if (c.kind !== "GRAIN" || !c.productId) continue;
    const existing = byProduct.get(c.productId) ?? {
      productName: c.productName ?? "Unknown product",
      owed: 0,
      paid: 0,
      settlements: {},
    };
    existing.owed += c.remaining;
    existing.paid += c.paid;
    existing.settlements[c.id] = { paid: c.paid, remaining: c.remaining };
    byProduct.set(c.productId, existing);
  }
  return byProduct;
}

// Shop-wide "Grain Udhaar" (Udhaar page → Shop (Udhaar) → Grain
// Udhaar): every grain purchase the shop still owes money on, each with
// its own paid/remaining from the shop ledger (oldest first across
// everything the shop owes that customer).
export async function listShopGrainUdhaar(productId?: string) {
  const shopId = await getCurrentShopId();
  const ledgers = await loadShopOwesCustomer(shopId);

  return [...ledgers.values()]
    .flatMap((l) =>
      l.charges
        .filter((c) => c.kind === "GRAIN" && (!productId || c.productId === productId) && c.remaining > 0.01)
        .map((c) => ({
          transactionId: c.id,
          customerId: l.customerId,
          customerName: l.customerName,
          productId: c.productId!,
          productName: c.productName ?? "Unknown product",
          unitName: c.unitName ?? "",
          quantity: c.quantity ?? 0,
          rate: c.rate ?? 0,
          borrowed: c.amount,
          date: c.date,
          remaining: c.remaining,
          paid: c.paid,
        }))
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Stat-card totals for the Shop (Udhaar) → Grain Udhaar subtab.
export async function getShopGrainUdhaarSummary(productId?: string) {
  const rows = await listShopGrainUdhaar(productId);
  return {
    totalRemaining: rows.reduce((sum, r) => sum + r.remaining, 0),
    totalPaid: rows.reduce((sum, r) => sum + r.paid, 0),
    customerCount: new Set(rows.map((r) => r.customerId)).size,
  };
}

// The Stock Management overview for one grain product: own-available,
// customer-claim, total-physical, outstanding Stock Udhaar (a
// quantity obligation), and moneyOwedToCustomers (money owed for
// already-settled grain, paid on Credit — see getShopOwedForGrain) —
// side by side, none of these figures ever conflated with each other.
// See StockSummary.tsx for the UI.
export async function getStockOverview(productId: string) {
  const shopId = await getCurrentShopId();

  const product = await db.product.findFirst({ where: { id: productId, shopId } });
  if (!product) throw new Error("Product not found");

  const batches = await db.grainBatch.findMany({ where: { productId } });

  let ownAvailable = 0;
  let ownValue = 0;
  let customerClaim = 0;
  let totalPhysical = 0;
  for (const batch of batches) {
    const quantityIn = Number(batch.quantityIn);
    const quantitySold = Number(batch.quantitySold);
    const quantityTransferred = Number(batch.quantityTransferred);
    const quantityReturned = Number(batch.quantityReturned);

    if (batch.ownerCustomerId) {
      // A customer batch's quantityTransferred portion was bought by
      // the shop and now lives in a NEW shop-owned batch (see
      // createTransferPurchase), so it's counted there, not here; and
      // quantitySold (grain sold from this deposit — Stock Udhaar) has
      // left the shelf. What's physically still here is what's left
      // after both — the same figure the sale FIFO uses
      // (drawGrainFifo). It can dip below 0 when the shop bought grain
      // that had already been sold: the new shop batch then holds that
      // already-gone quantity, and the negative here cancels it out.
      const remaining = quantityIn - quantitySold - quantityTransferred - quantityReturned;
      totalPhysical += remaining;
      if (remaining < 0) ownAvailable += remaining;
      // The customer's ownership claim, whatever has physically moved.
      customerClaim += quantityIn - quantityTransferred - quantityReturned;
    } else {
      const available = quantityIn - quantitySold;
      totalPhysical += available;
      ownAvailable += available;
      // What the grain the shop owns is worth: each own batch's
      // remaining quantity at the rate it was bought at (an own batch
      // always has a rate). Never negative, unlike the pooled value.
      ownValue += Math.max(available, 0) * Number(batch.rate ?? 0);
    }
  }

  const udhaarSummary = await getStockUdhaarSummary(undefined, productId);
  const stockUdhaarOutstanding = udhaarSummary.reduce((sum, u) => sum + u.quantity, 0);

  // Scoped to THIS product — per the "product-specific, not
  // shop-wide" decision (see getShopOwedForGrain's comment). A
  // customer's Cotton debt and Wheat debt are now tracked, paid, and
  // displayed as two independent figures, never combined.
  const owedEntries = await getShopOwedForGrain(undefined, productId);
  const moneyOwedToCustomers = owedEntries.reduce((sum, e) => sum + e.amountOwed, 0);

  // Pooled stock quantity/value — a separate, simpler tracker
  // alongside the per-batch figures above (see getPooledGrainStock's
  // comment for the full semantics).
  const pooled = await getPooledGrainStock(productId);

  // Grain loans still outstanding — what parties owe back to the shop
  // (lent out) and what the shop owes back (borrowed), each at the
  // loan's agreed rate.
  const loans = await db.grainLoan.findMany({ where: { shopId, productId }, include: { returns: true } });
  let lentOut = 0;
  let lentOutValue = 0;
  let borrowed = 0;
  let borrowedValue = 0;
  for (const loan of loans) {
    const given = loan.returns.reduce((s, r) => s + Number(r.quantityReturned) + Number(r.quantityPaid), 0);
    const outstanding = Math.max(Number(loan.quantity) - given, 0);
    if (loan.direction === "SHOP_LENT") {
      lentOut += outstanding;
      lentOutValue += outstanding * Number(loan.rate);
    } else {
      borrowed += outstanding;
      borrowedValue += outstanding * Number(loan.rate);
    }
  }
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  return {
    // What the shop OWNS, not just what's on its shelf: its own grain
    // on hand, plus grain it lent out (still the shop's, coming back),
    // minus grain it borrowed (on the shelf, but someone else's). Shown
    // below 0 when the shop has sold borrowed grain it still owes; the
    // next grain that comes in has that shortfall taken off first.
    ownAvailable: round3(ownAvailable + lentOut - borrowed),
    ownValue: Math.round((ownValue + lentOutValue - borrowedValue) * 100) / 100,
    lentOut: round3(lentOut),
    borrowed: round3(borrowed),
    customerClaim,
    totalPhysical,
    stockUdhaarOutstanding,
    moneyOwedToCustomers,
    pooled,
  };
}

// One customer's grain — every batch they've deposited (with the
// product/unit needed to display it, plus its settlement breakdown —
// see summarizeSettlements) plus any outstanding Stock Udhaar tied to
// them. Powers the customer detail page's Grain section, which
// appears automatically whenever a customer has any deposited
// batches — no separate account type or picker, same "shows up on its
// own" treatment the automatic Regular account gets (see
// customers/actions.ts: createCustomer).
export async function getCustomerGrainDeposits(customerId: string) {
  const shopId = await getCurrentShopId();

  const batches = await db.grainBatch.findMany({
    where: { ownerCustomerId: customerId, product: { shopId } },
    include: {
      product: { include: { unit: true } },
      transferredBatches: { include: { paymentTransactions: true } },
      depositReturns: { orderBy: { returnDate: "asc" } },
    },
    // Newest deposit first (desc) — matches Sales History's ordering;
    // the UI groups these rows into date headers by receivedAt.
    orderBy: { receivedAt: "desc" },
  });

  // A "Selling now" deposit (createDepositWithSettlement) never
  // creates a customer-owned GrainBatch at all — it goes straight to
  // a shop-owned batch (ownerCustomerId: null, sourceBatchId: null),
  // by design (see that function's comment). That means it's
  // completely invisible to the query above, which only looks at
  // batches this customer actually owns — a customer who sold
  // everything at drop-off, leaving nothing "for later," would show
  // zero grain history at all. The only remaining trace of the
  // customer on that purchase is the AccountTransaction
  // payCustomerForGrain created, linked via linkedGrainBatchId — same
  // link summarizeSettlements already reads for a transfer-purchase's
  // settlement row. Found here and folded in as a synthetic
  // "already-settled, no original deposit" batch so it renders
  // through the exact same settlements path below, instead of needing
  // a third row kind in CustomerGrainSection.
  const settleNowPayments = await db.accountTransaction.findMany({
    where: {
      customerAccount: { customerId },
      linkedGrainBatch: { ownerCustomerId: null, sourceBatchId: null, product: { shopId } },
    },
    include: { linkedGrainBatch: { include: { product: { include: { unit: true } } } } },
  });

  const udhaarEntries = await getStockUdhaarSummary(customerId);

  return {
    // Built explicitly as plain numbers, not via serializeDecimals —
    // that helper's return type is the same as its input (Decimal
    // fields stay typed as Decimal even though the runtime value is a
    // number), which breaks a Client Component reading these fields
    // directly. Same reasoning as getCustomer/listCustomers.
    batches: [
      ...batches.map((batch) => ({
        id: batch.id,
        quantityIn: Number(batch.quantityIn),
        quantitySold: Number(batch.quantitySold),
        quantityTransferred: Number(batch.quantityTransferred),
        rate: batch.rate !== null ? Number(batch.rate) : null,
        receivedAt: batch.receivedAt,
        product: { id: batch.product.id, name: batch.product.name, unitName: batch.product.unit.name },
        ...summarizeSettlements(batch, batch.transferredBatches),
        // Unsettled grain given back to the customer as it is.
        returns: batch.depositReturns.map((r) => ({
          id: r.id,
          quantity: Number(r.quantity),
          returnDate: r.returnDate,
          reference: r.reference,
          notes: r.notes,
        })),
      })),
      ...settleNowPayments
        .filter((txn) => txn.linkedGrainBatch !== null)
        .map((txn) => {
          const b = txn.linkedGrainBatch!;
          const quantity = Number(b.quantityIn);
          const rate = Number(b.rate);
          return {
            id: b.id,
            quantityIn: quantity,
            quantitySold: Number(b.quantitySold),
            quantityTransferred: 0,
            rate,
            receivedAt: b.receivedAt,
            product: { id: b.product.id, name: b.product.name, unitName: b.product.unit.name },
            settlements: [
              {
                batchId: b.id,
                transactionId: txn.id,
                quantity,
                rate,
                receivedAt: b.receivedAt,
                paymentMethod: txn.paymentMethod,
              },
            ],
            settledQuantity: quantity,
            settledTotalAmount: quantity * rate,
            unsettledQuantity: 0,
            returnedQuantity: 0,
            returns: [],
          };
        }),
      // The two arrays above are each individually sorted (the DB
      // query's orderBy, and settleNowPayments' natural insertion
      // order), but concatenating them interleaves dates — without
      // re-sorting the merged list, GrainBatchList's date-header
      // grouping (which only inserts a header when the date differs
      // from the PREVIOUS row) sees the same date appear twice,
      // non-consecutively, and renders two separate headers for it.
    ].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()),
    stockUdhaar: udhaarEntries,
  };
}

// The Grain page's per-product customer-deposit table: every
// customer-owned batch for this product, with its settlement
// breakdown — deliberately EXCLUDES shop-owned batches entirely
// (whether added directly or created by a transfer-purchase/settle-
// now deposit), since those already fold into the "Own stock" figure
// on getStockOverview and don't need their own row — see
// GrainBatchList.tsx. Newest deposit first (desc), matching Sales
// History's ordering — receivedAt is what the UI groups rows by date
// headers on (see GrainBatchList.tsx), same "group by deposit date"
// convention getCustomerGrainDeposits' batches use.
export async function listCustomerBatchesForProduct(productId: string) {
  const shopId = await getCurrentShopId();

  const batches = await db.grainBatch.findMany({
    where: { productId, product: { shopId }, ownerCustomerId: { not: null } },
    include: {
      ownerCustomer: true,
      transferredBatches: { include: { paymentTransactions: true } },
    },
    orderBy: { receivedAt: "desc" },
  });

  // See getCustomerGrainDeposits' comment on settleNowPayments — a
  // "Selling now" deposit never creates a customer-owned GrainBatch,
  // so without this it's invisible here too: a customer who sold
  // everything at drop-off never gets a row on this product's table
  // at all. Found via the same payCustomerForGrain-created
  // AccountTransaction link, scoped to this product instead of a
  // customer.
  const settleNowPayments = await db.accountTransaction.findMany({
    where: {
      linkedGrainBatch: { ownerCustomerId: null, sourceBatchId: null, productId, product: { shopId } },
    },
    include: { linkedGrainBatch: true, customerAccount: { include: { customer: true } } },
  });

  return [
    ...batches.map((batch) => ({
      id: batch.id,
      customerId: batch.ownerCustomerId!,
      customerName: batch.ownerCustomer!.name,
      quantityIn: Number(batch.quantityIn),
      quantityTransferred: Number(batch.quantityTransferred),
      receivedAt: batch.receivedAt,
      ...summarizeSettlements(batch, batch.transferredBatches),
    })),
    ...settleNowPayments
      .filter((txn) => txn.linkedGrainBatch !== null)
      .map((txn) => {
        const b = txn.linkedGrainBatch!;
        const quantity = Number(b.quantityIn);
        const rate = Number(b.rate);
        return {
          id: b.id,
          customerId: txn.customerAccount.customerId,
          customerName: txn.customerAccount.customer.name,
          quantityIn: quantity,
          quantityTransferred: 0,
          receivedAt: b.receivedAt,
          settlements: [
            {
              batchId: b.id,
              quantity,
              rate,
              receivedAt: b.receivedAt,
              paymentMethod: txn.paymentMethod,
            },
          ],
          settledQuantity: quantity,
          settledTotalAmount: quantity * rate,
          unsettledQuantity: 0,
          returnedQuantity: 0,
        };
      }),
    // Re-sort after merging — see getCustomerGrainDeposits' identical
    // comment on why concatenating two already-sorted arrays still
    // needs a final sort, so GrainBatchList's date-header grouping
    // never sees the same date twice, non-consecutively.
  ].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
}

// One grain product's money history for the Grain page's "Sales &
// purchases" tabs. Credit = the shop selling this grain (to a customer
// or a dealer — one row per sale item); Debit = the shop buying it
// (from a customer, via a settlement, or from a grain dealer). Each
// row is tagged with who the other party was. Newest first.
export type GrainLedgerRow = {
  id: string;
  date: Date;
  // SHOP = the shop's own stock added with Add batch (no seller).
  party: "CUSTOMER" | "DEALER" | "SHOP";
  partyName: string;
  partyHref: string;
  quantity: number;
  rate: number;
  amount: number;
  // e.g. "Cash", "Bank", "Udhaar", "Part Udhaar", "Mixed".
  payment: string;
  paymentTone: "cash" | "account" | "credit" | "mixed";
};

const METHOD_LABEL: Record<string, { label: string; tone: GrainLedgerRow["paymentTone"] }> = {
  CASH: { label: "Cash", tone: "cash" },
  ACCOUNT: { label: "Bank", tone: "account" },
  CREDIT: { label: "Udhaar", tone: "credit" },
};

export async function listGrainLedger(productId: string) {
  const shopId = await getCurrentShopId();

  const [saleItems, customerPurchases, dealerBatches, ownBatches] = await Promise.all([
    db.dailySaleItem.findMany({
      where: { productId, product: { shopId } },
      include: { dailySale: { include: { customer: true, dealer: true, payments: true } } },
    }),
    // The shop buying this grain from a customer — every settlement's
    // payment row (OUT with a quantity and its new shop batch).
    db.accountTransaction.findMany({
      where: {
        direction: "OUT",
        quantity: { not: null },
        linkedGrainBatch: { productId, product: { shopId } },
      },
      include: { linkedGrainBatch: true, customerAccount: { include: { customer: true } } },
    }),
    db.grainBatch.findMany({
      where: { productId, dealerId: { not: null }, dealer: { shopId } },
      include: { dealer: { include: { account: { include: { transactions: true } } } } },
    }),
    // Own stock added with Add batch — a shop batch that came from no
    // dealer, customer purchase or grain loan (each of those has its
    // own row or tab). No payment is recorded for these.
    db.grainBatch.findMany({
      where: {
        productId,
        product: { shopId },
        ownerCustomerId: null,
        dealerId: null,
        sourceBatchId: null,
        grainLoanId: null,
        grainLoanReturnId: null,
        paymentTransactions: { none: {} },
      },
    }),
  ]);

  const credit: GrainLedgerRow[] = saleItems.map((item) => {
    const sale = item.dailySale;
    const quantity = Number(item.quantity);
    const rate = Number(item.actualPrice);
    // After the line's share of any bill discount.
    const amount = quantity * rate - Number(item.discount);
    const creditAmount = item.creditAmount !== null ? Number(item.creditAmount) : 0;
    const visitMethods = [
      ...new Set(
        sale.payments.filter((p) => p.visitAt.getTime() === item.visitAt.getTime()).map((p) => p.paymentMethod)
      ),
    ];
    const pay =
      creditAmount >= amount - 0.01 && creditAmount > 0
        ? METHOD_LABEL.CREDIT
        : creditAmount > 0.01
          ? { label: "Part Udhaar", tone: "credit" as const }
          : visitMethods.length === 1
            ? METHOD_LABEL[visitMethods[0]]
            : // A split visit names every method it used, e.g. "Cash + Bank".
              {
                label: visitMethods.map((m) => METHOD_LABEL[m].label).join(" + "),
                tone: visitMethods.includes("CREDIT") ? ("credit" as const) : ("mixed" as const),
              };
    return {
      id: item.id,
      date: item.visitAt,
      party: sale.dealerId ? "DEALER" : "CUSTOMER",
      partyName: sale.dealer?.name ?? sale.customer?.name ?? "Walk-in",
      partyHref: sale.dealerId ? `/dashboard/dealers/${sale.dealerId}` : `/dashboard/customers/${sale.customerId}`,
      quantity,
      rate,
      amount,
      payment: pay.label,
      paymentTone: pay.tone,
    };
  });

  // Own stock added with Add batch is stock coming IN — a plus, so it
  // sits with Credit (as on Daily sales), not with purchases.
  credit.push(
    ...ownBatches.map((batch): GrainLedgerRow => {
      const quantity = Number(batch.quantityIn);
      const rate = Number(batch.rate ?? 0);
      return {
        id: batch.id,
        date: batch.receivedAt,
        party: "SHOP",
        partyName: "Own stock added",
        partyHref: `/dashboard/grain?product=${productId}`,
        quantity,
        rate,
        amount: quantity * rate,
        payment: "Stock only",
        paymentTone: "mixed",
      };
    })
  );

  const debit: GrainLedgerRow[] = [
    ...customerPurchases.map((txn) => {
      const quantity = Number(txn.quantity);
      const rate = txn.linkedGrainBatch?.rate != null ? Number(txn.linkedGrainBatch.rate) : 0;
      const pay = METHOD_LABEL[txn.paymentMethod];
      return {
        id: txn.id,
        date: txn.transactionDate,
        party: "CUSTOMER" as const,
        partyName: txn.customerAccount.customer.name,
        partyHref: `/dashboard/customers/${txn.customerAccount.customerId}?tab=grain`,
        quantity,
        rate,
        amount: Number(txn.amount),
        payment: pay.label,
        paymentTone: pay.tone,
      };
    }),
    ...dealerBatches.map((batch) => {
      const quantity = Number(batch.quantityIn);
      const rate = batch.rate !== null ? Number(batch.rate) : 0;
      const amount = quantity * rate;
      // createDealerGrainPurchase posts its payment row in the same
      // transaction as the batch — matched by dealer, amount and time,
      // since the row carries no batch link.
      const paymentRow = batch.dealer?.account?.transactions.find(
        (t) =>
          t.direction === "OUT" &&
          Math.abs(Number(t.amount) - amount) < 0.01 &&
          Math.abs(t.transactionDate.getTime() - batch.receivedAt.getTime()) < 60_000
      );
      const pay = paymentRow ? METHOD_LABEL[paymentRow.paymentMethod] : { label: "—", tone: "mixed" as const };
      return {
        id: batch.id,
        date: batch.receivedAt,
        party: "DEALER" as const,
        partyName: batch.dealer?.name ?? "Dealer",
        partyHref: `/dashboard/dealers/${batch.dealerId}`,
        quantity,
        rate,
        amount,
        payment: pay.label,
        paymentTone: pay.tone,
      };
    }),
  ];

  const byNewest = (a: GrainLedgerRow, b: GrainLedgerRow) => b.date.getTime() - a.date.getTime();
  credit.sort(byNewest);
  debit.sort(byNewest);
  const sum = (rows: GrainLedgerRow[], key: "amount" | "quantity") => rows.reduce((s, r) => s + r[key], 0);

  return {
    credit,
    debit,
    creditTotal: sum(credit, "amount"),
    creditQuantity: sum(credit, "quantity"),
    debitTotal: sum(debit, "amount"),
    debitQuantity: sum(debit, "quantity"),
  };
}

// Takes `quantity` of a deposit's unsettled grain out of the shop for
// its customer (no rate, no money): whatever of it is still on the
// shelf goes first; if the shop had already sold some of their grain
// (Stock Udhaar), that part comes from the shop's own stock instead
// (coverDepositFromOwnStock). Throws with a message the shopkeeper can
// read when it can't be done. Returns how much came from own stock.
async function takeUnsettledGrain(
  tx: Prisma.TransactionClient,
  batch: { id: string; productId: string; quantityIn: Prisma.Decimal; quantityTransferred: Prisma.Decimal; quantityReturned: Prisma.Decimal },
  quantity: number,
  names: { unit: string; product: string }
): Promise<number> {
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const unsettled = round3(Number(batch.quantityIn) - Number(batch.quantityTransferred) - Number(batch.quantityReturned));
  if (quantity > unsettled + 0.0001) {
    throw new Error(`Only ${unsettled} ${names.unit} of this deposit is unsettled — that's the most that can be given back.`);
  }

  // What the shop still owes this deposit in grain (sold before a rate
  // was settled); the rest of the unsettled grain is still here.
  const suEntries = await tx.stockUdhaarEntry.findMany({ where: { grainBatchId: batch.id } });
  const soldUnsettled = Math.max(round3(suEntries.reduce((s, e) => s + Number(e.quantity), 0)), 0);
  const onShelf = Math.max(round3(unsettled - soldUnsettled), 0);
  const fromShopStock = round3(quantity - Math.min(quantity, onShelf));

  if (fromShopStock > 0) {
    const own = await tx.grainBatch.findMany({ where: { productId: batch.productId, ownerCustomerId: null } });
    const ownFree = round3(own.reduce((s, b) => s + Math.max(Number(b.quantityIn) - Number(b.quantitySold), 0), 0));
    if (ownFree + 0.0001 < fromShopStock) {
      throw new Error(
        `${fromShopStock} ${names.unit} of this grain was already sold, so the shop must give it from its own ${names.product} — but it has only ${ownFree} ${names.unit} of its own.`
      );
    }
    const covered = await coverDepositFromOwnStock(tx, { productId: batch.productId, depositId: batch.id, quantity: fromShopStock });
    if (covered + 0.0001 < fromShopStock) {
      throw new Error(`Could only cover ${covered} of ${fromShopStock} ${names.unit} from the shop's own stock.`);
    }
    // The shop's own grain left the shop (no money) — same as lending grain.
    await postToPooledGrainStock(tx, batch.productId, -fromShopStock, 0);
  }

  await tx.grainBatch.update({ where: { id: batch.id }, data: { quantityReturned: { increment: quantity } } });
  return fromShopStock;
}

// A customer taking back grain they deposited without settling a rate
// — as it is: no money, no rate, only their unsettled quantity on this
// deposit goes down (quantityReturned) and the grain leaves the shop
// (see takeUnsettledGrain for where it comes from).
export async function giveBackUnsettledGrain(input: DepositReturnInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = depositReturnSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const data = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const batch = await tx.grainBatch.findFirst({
        where: { id: data.grainBatchId, product: { shopId } },
        include: { product: { include: { unit: true } } },
      });
      if (!batch || !batch.ownerCustomerId) return fail("Deposit not found.");

      const fromShopStock = await takeUnsettledGrain(tx, batch, data.quantity, {
        unit: batch.product.unit.name,
        product: batch.product.name,
      });
      await tx.grainDepositReturn.create({
        data: {
          shopId,
          grainBatchId: batch.id,
          customerId: batch.ownerCustomerId,
          productId: batch.productId,
          quantity: data.quantity,
          fromShopStock,
          returnDate: data.returnDate ? parseLocalDateStart(data.returnDate) : new Date(),
          reference: data.reference,
          notes: data.notes || null,
        },
      });
      return ok(null);
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't give the grain back.");
  }
}

// Editing a give-back: date, reference and notes simply change. A
// bigger quantity gives back the extra the same way as a new give-back
// (up to what's unsettled, already-sold grain from own stock). A
// smaller one puts the difference back as the customer's unsettled
// grain, on the shelf again — the shop's own stock used earlier stays
// used (the customer's grain it replaced is what's back on the shelf,
// so the shop no longer owes them that grain either way).
export async function updateGrainDepositReturn(input: UpdateDepositReturnInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const parsed = updateDepositReturnSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const data = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.grainDepositReturn.findFirst({
        where: { id: data.id, shopId },
        include: { grainBatch: true, product: { include: { unit: true } } },
      });
      if (!existing) return fail("Give-back not found.");

      const delta = Math.round((data.quantity - Number(existing.quantity)) * 1000) / 1000;
      let fromShopStock = Number(existing.fromShopStock);
      if (delta > 0) {
        fromShopStock += await takeUnsettledGrain(tx, existing.grainBatch, delta, {
          unit: existing.product.unit.name,
          product: existing.product.name,
        });
      } else if (delta < 0) {
        await tx.grainBatch.update({
          where: { id: existing.grainBatchId },
          data: { quantityReturned: { decrement: -delta } },
        });
      }

      await tx.grainDepositReturn.update({
        where: { id: existing.id },
        data: {
          quantity: data.quantity,
          fromShopStock: Math.round(fromShopStock * 1000) / 1000,
          returnDate: data.returnDate ? parseLocalDateStart(data.returnDate) : existing.returnDate,
          reference: data.reference,
          notes: data.notes || null,
        },
      });
      return ok(null);
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't save the change.");
  }
}
