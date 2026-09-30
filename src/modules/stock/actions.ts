"use server";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import {
  transferPurchaseSchema,
  depositWithSettlementSchema,
  payGrainDebtSchema,
  type TransferPurchaseInput,
  type DepositWithSettlementInput,
  type PayGrainDebtInput,
} from "./schema";

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
    notes?: string;
    newShopBatchId: string;
  }
) {
  // Find-or-create the customer's Regular account — same
  // find-or-create pattern applyPaymentSplit already uses for Udhaar
  // (see daily-sales/actions.ts).
  const regularType = await tx.accountType.findFirst({ where: { shopId, code: "REGULAR" } });
  if (!regularType) {
    throw new Error("No Regular account type configured for this shop — run ensureDefaultAccountType first.");
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
      // Links this transaction to the exact batch it paid for — lets
      // a per-settlement view (the customer's Grain tab) show this
      // specific purchase's own paid/Udhaar status and date, not just
      // an aggregate across the whole account. See the schema
      // comment on AccountTransaction.linkedGrainBatchId.
      linkedGrainBatchId: params.newShopBatchId,
      notes: params.notes || `Purchased ${params.quantity} ${params.productName} from deposit @ ${params.rate}`,
    },
  });
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
export async function createTransferPurchase(input: TransferPurchaseInput) {
  const shopId = await getCurrentShopId();
  const data = transferPurchaseSchema.parse(input);

  return db.$transaction(async (tx) => {
    const sourceBatch = await tx.grainBatch.findFirst({
      where: { id: data.grainBatchId, product: { shopId } },
      include: { product: true },
    });
    if (!sourceBatch) throw new Error("Batch not found");
    if (!sourceBatch.ownerCustomerId) {
      throw new Error("Only a customer-deposited batch can be transfer-purchased — this batch is shop-owned.");
    }

    const remainingClaim = Number(sourceBatch.quantityIn) - Number(sourceBatch.quantityTransferred);
    if (data.quantity > remainingClaim) {
      throw new Error(
        `Only ${remainingClaim} ${sourceBatch.product.name} remains as this customer's claim on this batch (requested ${data.quantity}).`
      );
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
      notes: data.notes,
      newShopBatchId: newShopBatch.id,
    });

    const updatedSourceBatch = await tx.grainBatch.findUniqueOrThrow({ where: { id: sourceBatch.id } });

    return {
      sourceBatch: serializeDecimals(updatedSourceBatch),
      newBatch: serializeDecimals(newShopBatch),
      payment,
    };
  });
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
export async function createDepositWithSettlement(input: DepositWithSettlementInput) {
  const shopId = await getCurrentShopId();
  const data = depositWithSettlementSchema.parse(input);

  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: data.productId, shopId } });
    if (!product) throw new Error("Product not found");

    const customer = await tx.customer.findFirst({ where: { id: data.customerId, shopId } });
    if (!customer) throw new Error("Customer not found");

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
      notes: data.notes,
      newShopBatchId: newShopBatch.id,
    });

    return {
      newBatch: serializeDecimals(newShopBatch),
      payment,
    };
  });
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
  quantity: number;
  rate: number;
  receivedAt: Date;
  paymentMethod: "CASH" | "ACCOUNT" | "CREDIT" | null;
};
function summarizeSettlements(
  batch: { quantityIn: Prisma.Decimal; quantityTransferred: Prisma.Decimal },
  transferredBatches: {
    id: string;
    quantityIn: Prisma.Decimal;
    rate: Prisma.Decimal | null;
    receivedAt: Date;
    paymentTransactions: { paymentMethod: "CASH" | "ACCOUNT" | "CREDIT" }[];
  }[]
) {
  const settlements: SettlementEntry[] = transferredBatches
    .filter((b) => b.rate !== null)
    .map((b) => ({
      batchId: b.id,
      quantity: Number(b.quantityIn),
      rate: Number(b.rate),
      receivedAt: b.receivedAt,
      paymentMethod: b.paymentTransactions[0]?.paymentMethod ?? null,
    }));
  const settledQuantity = settlements.reduce((sum, s) => sum + s.quantity, 0);
  const settledTotalAmount = settlements.reduce((sum, s) => sum + s.quantity * s.rate, 0);
  const unsettledQuantity = Number(batch.quantityIn) - Number(batch.quantityTransferred);
  return { settlements, settledQuantity, settledTotalAmount, unsettledQuantity };
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

// Money the shop currently owes customers for grain it has already
// taken ownership of (via a Credit-paid transfer-purchase/settle-now
// deposit) but hasn't actually paid out yet — NOT the same thing as
// Stock Udhaar (a quantity obligation from selling before settling).
// This is the mirror case: the stock side is fully settled (ownership
// moved, ledger posted), only the MONEY side is still outstanding.
//
// Deliberately does NOT just read CustomerAccount.currentBalance
// going negative — an account can be shared with unrelated activity
// (e.g. a Udhaar/loan account where a mis-entered repayment larger
// than what was borrowed also pushes the balance negative), which
// would misreport an unrelated bookkeeping error as "owed for grain."
// payCustomerForGrain sets `quantity` on EVERY payment method (Cash/
// Account/Credit — it's the marker for "this is a grain purchase
// posting," not "this is unpaid"), but only a CREDIT-paid one ever
// leaves real money owed — Cash/Account are settled in the same
// breath as the purchase and never touch the balance at all (see that
// function's comment). So only CREDIT OUT postings count as debt
// here; payGrainDebt's IN postings (always paid via Cash/Account —
// see its schema, CREDIT is deliberately not an option there) net one
// down regardless.
// productId optionally scopes the result to one grain product — per
// the "product-specific, not shop-wide" decision (a customer's Cotton
// debt and Wheat debt are tracked as two separate numbers, never
// combined). The OUT side (a Credit-paid transfer-purchase/settle-now
// deposit) is always attributable to a product via
// linkedGrainBatch.productId — every such posting creates exactly one
// grain batch for exactly one product (see payCustomerForGrain). The
// IN side (a payGrainDebt repayment) is attributable via
// linkedProductId, which payGrainDebt now always sets — per the "pay
// per product, from that product's own row" decision, there is no
// longer any cross-product combined payment to worry about
// misattributing. Omitting productId gives the old shop-wide total
// (every product's debt for that customer combined) — still used
// where a genuinely cross-product figure is wanted (e.g. a customer's
// account-level summary).
export async function getShopOwedForGrain(customerId?: string, productId?: string) {
  const shopId = await getCurrentShopId();

  const transactions = await db.accountTransaction.findMany({
    where: {
      quantity: { not: null },
      OR: [{ direction: "OUT", paymentMethod: "CREDIT" }, { direction: "IN" }],
      customerAccount: {
        customerId: customerId || undefined,
        customer: { shopId },
      },
    },
    include: {
      customerAccount: { include: { customer: true } },
      linkedGrainBatch: { select: { productId: true } },
    },
  });

  const byCustomer = new Map<string, { customerId: string; customerName: string; amountOwed: number }>();
  for (const txn of transactions) {
    if (productId) {
      const txnProductId = txn.direction === "OUT" ? txn.linkedGrainBatch?.productId : txn.linkedProductId;
      if (txnProductId !== productId) continue;
    }
    // OUT (CREDIT-paid, per the filter above) grows the debt; IN
    // (payGrainDebt) shrinks it.
    const delta = txn.direction === "OUT" ? Number(txn.amount) : -Number(txn.amount);
    if (delta === 0) continue;
    const cId = txn.customerAccount.customerId;
    const existing = byCustomer.get(cId);
    if (existing) {
      existing.amountOwed += delta;
    } else {
      byCustomer.set(cId, {
        customerId: cId,
        customerName: txn.customerAccount.customer.name,
        amountOwed: delta,
      });
    }
  }

  // Floating-point noise or a fully-settled customer can land at ~0 —
  // filter those out so a settled debt doesn't linger as a stray
  // "Rs 0.00 owed" row.
  return Array.from(byCustomer.values()).filter((e) => e.amountOwed > 0.01);
}

// One customer's money-owed broken out PER PRODUCT — powers
// CustomerGrainSection (the customer detail page's Grain tab and
// StockFromCustomerForm's deposits panel), where each settlement row
// needs to know THAT row's own product's outstanding debt, not one
// combined cross-product figure (see getShopOwedForGrain's comment on
// why the two are no longer the same number). Returns both `owed`
// (the net still outstanding — OUT minus IN, same math
// getShopOwedForGrain uses) and `paid` (just the IN side — every
// payGrainDebt repayment made against this product) so a "Paid so
// far" figure can be shown alongside "Shop owes", not just implied by
// what "owed" no longer includes. A batch with no rate-less/Credit
// settlement never appears here — only products with a genuinely
// positive owed OR paid amount are included, same "no stray Rs 0 row"
// filtering getShopOwedForGrain already does.
export async function getShopOwedForGrainByProduct(customerId: string) {
  const shopId = await getCurrentShopId();

  const transactions = await db.accountTransaction.findMany({
    where: {
      quantity: { not: null },
      OR: [{ direction: "OUT", paymentMethod: "CREDIT" }, { direction: "IN" }],
      customerAccount: { customerId, customer: { shopId } },
    },
    include: {
      linkedGrainBatch: { select: { productId: true, product: { select: { name: true } } } },
      linkedProduct: { select: { name: true } },
    },
  });

  const byProduct = new Map<string, { productName: string; owed: number; paid: number }>();
  for (const txn of transactions) {
    const productId = txn.direction === "OUT" ? txn.linkedGrainBatch?.productId : txn.linkedProductId;
    if (!productId) continue;
    const productName =
      (txn.direction === "OUT" ? txn.linkedGrainBatch?.product.name : txn.linkedProduct?.name) ?? "Unknown product";
    const amount = Number(txn.amount);
    const existing = byProduct.get(productId) ?? { productName, owed: 0, paid: 0 };
    if (txn.direction === "OUT") {
      existing.owed += amount;
    } else {
      existing.owed -= amount;
      existing.paid += amount;
    }
    byProduct.set(productId, existing);
  }

  return byProduct;
}

// Pays down money the shop owes a customer for grain (see
// getShopOwedForGrain) — the opposite direction from
// recordAccountTransaction's debt convention, since that one is built
// for a customer's debt TO the shop, not the shop's debt to a
// customer. Posts a signed AccountTransaction the same way
// payCustomerForGrain does (direction IN, with `quantity` set so
// getShopOwedForGrain picks it up and nets it against the debt it's
// paying down), and moves currentBalance back toward zero
// (increment — the balance is negative while owed, per
// describeBalance's convention).
export async function payGrainDebt(input: PayGrainDebtInput) {
  const shopId = await getCurrentShopId();
  const data = payGrainDebtSchema.parse(input);

  const owed = await getShopOwedForGrain(data.customerId, data.productId);
  const outstanding = owed[0]?.amountOwed ?? 0;
  if (data.amount > outstanding + 0.01) {
    throw new Error(
      `This payment (Rs ${data.amount}) is more than what's actually owed for this product (Rs ${outstanding}) — a payment can't exceed what's owed.`
    );
  }

  const regularType = await db.accountType.findFirst({ where: { shopId, code: "REGULAR" } });
  if (!regularType) {
    throw new Error("No Regular account type configured for this shop.");
  }
  const customerAccount = await db.customerAccount.findFirst({
    where: { customerId: data.customerId, accountTypeId: regularType.id },
  });
  if (!customerAccount) throw new Error("This customer has no Regular account.");

  await db.$transaction(async (tx) => {
    await tx.accountTransaction.create({
      data: {
        customerAccountId: customerAccount.id,
        direction: "IN",
        amount: data.amount,
        // Non-null quantity is what marks this as a grain-debt
        // posting for getShopOwedForGrain — the value itself isn't a
        // real physical quantity (this is a pure money payment), so
        // it's just a marker; 0 keeps it truthful rather than
        // inventing a fake quantity.
        quantity: 0,
        linkedProductId: data.productId,
        paymentMethod: data.paymentMethod,
        notes: data.notes || "Paid customer for settled grain",
      },
    });
    await tx.customerAccount.update({
      where: { id: customerAccount.id },
      data: { currentBalance: { increment: data.amount } },
    });
  });
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
  let customerClaim = 0;
  let totalPhysical = 0;
  for (const batch of batches) {
    const quantityIn = Number(batch.quantityIn);
    const quantitySold = Number(batch.quantitySold);
    const quantityTransferred = Number(batch.quantityTransferred);

    // A customer batch's quantityTransferred portion physically stays
    // on the shelf, but it's now counted in the NEW shop-owned batch a
    // transfer-purchase created (see createTransferPurchase) — so it
    // must be subtracted here too, or it gets counted twice: once on
    // this row (still part of quantityIn) and once on the new batch's
    // row. BUT quantitySold and quantityTransferred are not two
    // independent departures that both remove grain from this batch —
    // per GrainBatch.quantityTransferred's schema comment, buying
    // ALREADY-SOLD grain via a transfer-purchase (settling a Stock
    // Udhaar shortfall) increments quantityTransferred for grain that
    // left the shelf via quantitySold, not a second time. Subtracting
    // both in full double-counts that overlap and can even drive
    // `available` negative. Only the portion of quantityTransferred
    // that exceeds quantitySold represents grain genuinely still on
    // the shelf being moved into a new batch — that's the only part
    // that should reduce this row's own physical count a second time.
    // Shop-owned batches never have quantityTransferred set (it's
    // always 0), so this is a no-op for them.
    const transferredBeyondSold = Math.max(quantityTransferred - quantitySold, 0);
    const available = quantityIn - quantitySold - transferredBeyondSold;
    totalPhysical += available;
    if (batch.ownerCustomerId) {
      customerClaim += quantityIn - quantityTransferred;
    } else {
      ownAvailable += available;
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

  return { ownAvailable, customerClaim, totalPhysical, stockUdhaarOutstanding, moneyOwedToCustomers };
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
    },
    // Newest deposit first (desc) — matches Sales History's ordering;
    // the UI groups these rows into date headers by receivedAt.
    orderBy: { receivedAt: "desc" },
  });

  const udhaarEntries = await getStockUdhaarSummary(customerId);

  return {
    // Built explicitly as plain numbers, not via serializeDecimals —
    // that helper's return type is the same as its input (Decimal
    // fields stay typed as Decimal even though the runtime value is a
    // number), which breaks a Client Component reading these fields
    // directly. Same reasoning as getCustomer/listCustomers.
    batches: batches.map((batch) => ({
      id: batch.id,
      quantityIn: Number(batch.quantityIn),
      quantitySold: Number(batch.quantitySold),
      quantityTransferred: Number(batch.quantityTransferred),
      rate: batch.rate !== null ? Number(batch.rate) : null,
      receivedAt: batch.receivedAt,
      product: { id: batch.product.id, name: batch.product.name, unitName: batch.product.unit.name },
      ...summarizeSettlements(batch, batch.transferredBatches),
    })),
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

  return batches.map((batch) => ({
    id: batch.id,
    customerId: batch.ownerCustomerId!,
    customerName: batch.ownerCustomer!.name,
    quantityIn: Number(batch.quantityIn),
    quantityTransferred: Number(batch.quantityTransferred),
    receivedAt: batch.receivedAt,
    ...summarizeSettlements(batch, batch.transferredBatches),
  }));
}
