"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { parseLocalDateNow } from "@/lib/utils";
import { postToBankAccount } from "@/modules/settings/bankAccounts.actions";
import { postToPooledGrainStock } from "@/modules/stock/actions";
import { mainUnitsPer, subUnitsPerUnit } from "@/modules/products/units";
import { saleReturnSchema, purchaseReturnSchema, type SaleReturnInput, type PurchaseReturnInput } from "./schema";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// A refused return writes nothing (same reason as daily-sales'
// saleTransaction: returning { success: false } inside a transaction
// would still commit what ran before it).
class Refused extends Error {}
async function inTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await db.$transaction(fn));
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    return fail(err instanceof Error ? err.message : "Couldn't save the return.");
  }
}

// ── Sales returns ──

export type ReturnableBill = {
  dailySaleId: string;
  visitAt: Date;
  receiptNumber: number | null;
  total: number;
  // How the bill was paid — a return goes back the same way.
  paid: { cash: number; account: number; credit: number };
  items: {
    id: string;
    productName: string;
    unitName: string;
    isGrain: boolean;
    quantity: number;
    returned: number;
    remaining: number;
    // What one unit came to on the bill, after its discount share.
    netUnitPrice: number;
  }[];
};

// A customer's (or dealer's) recent bills with what's still returnable
// on each line — the Sales return form's bill picker. Newest first.
export async function listReturnableBills(buyer: { customerId?: string; dealerId?: string }): Promise<ReturnableBill[]> {
  const shopId = await getCurrentShopId();
  if (!buyer.customerId && !buyer.dealerId) return [];
  const sales = await db.dailySale.findMany({
    where: { shopId, ...(buyer.customerId ? { customerId: buyer.customerId } : { dealerId: buyer.dealerId }) },
    include: {
      items: { include: { product: { include: { unit: true } }, returnItems: true } },
      receipts: true,
      payments: true,
    },
    orderBy: { saleDate: "desc" },
    take: 60,
  });
  const bills: ReturnableBill[] = [];
  for (const sale of sales) {
    const times = [...new Set(sale.items.map((i) => i.visitAt.getTime()))].sort((a, b) => b - a);
    for (const t of times) {
      const items = sale.items.filter((i) => i.visitAt.getTime() === t);
      bills.push({
        dailySaleId: sale.id,
        visitAt: new Date(t),
        receiptNumber: sale.receipts.find((r) => r.visitAt.getTime() === t)?.receiptNumber ?? null,
        total: round2(items.reduce((s, i) => s + Number(i.quantity) * Number(i.actualPrice) - Number(i.discount), 0)),
        paid: (() => {
          const ps = sale.payments.filter((p) => p.visitAt.getTime() === t);
          const sum = (m: string) => round2(ps.filter((p) => p.paymentMethod === m).reduce((s, p) => s + Number(p.amount), 0));
          return { cash: sum("CASH"), account: sum("ACCOUNT"), credit: sum("CREDIT") };
        })(),
        items: items.map((i) => {
          const quantity = Number(i.quantity);
          const returned = round6(i.returnItems.reduce((s, r) => s + Number(r.quantity), 0));
          return {
            id: i.id,
            productName: i.product.name,
            unitName: i.unitName ?? i.product.unit.name,
            isGrain: i.product.stockKind === "GRAIN",
            quantity,
            returned,
            remaining: round6(quantity - returned),
            netUnitPrice: quantity > 0 ? round2((quantity * Number(i.actualPrice) - Number(i.discount)) / quantity) : 0,
          };
        }),
      });
    }
  }
  return bills.sort((a, b) => b.visitAt.getTime() - a.visitAt.getTime()).slice(0, 60);
}

// Goods brought back from one bill. Each line is worth what it came to
// on the bill (its discount share included); the money goes back the
// way the bill was paid — split in the bill's own cash / bank / Udhaar
// proportions (Udhaar is taken off what they owe). Products go back
// into stock; grain goes back into the batches it was sold from
// (a customer's deposit first, which lowers their Stock Udhaar).
export async function createSaleReturn(input: SaleReturnInput): Promise<ActionResult<{ id: string; amount: number }>> {
  const shopId = await getCurrentShopId();
  const parsed = saleReturnSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const data = parsed.data;

  return inTransaction(async (tx) => {
    const sale = await tx.dailySale.findFirst({ where: { id: data.dailySaleId, shopId } });
    if (!sale) throw new Refused("Bill not found.");
    const items = await tx.dailySaleItem.findMany({
      where: { dailySaleId: sale.id, visitAt: data.visitAt },
      include: {
        product: { include: { unit: true, subUnit: true } },
        returnItems: true,
        batchAllocations: { include: { grainBatch: true } },
      },
    });
    const payments = await tx.dailySalePayment.findMany({ where: { dailySaleId: sale.id, visitAt: data.visitAt } });

    const returnDate = data.returnDate ? parseLocalDateNow(data.returnDate) : new Date();
    const lines: {
      item: (typeof items)[number];
      quantity: number;
      amount: number;
    }[] = [];
    for (const line of data.items) {
      const item = items.find((i) => i.id === line.dailySaleItemId);
      if (!item) throw new Refused("That item isn't on this bill.");
      const sold = Number(item.quantity);
      const returned = item.returnItems.reduce((s, r) => s + Number(r.quantity), 0);
      if (line.quantity > sold - returned + 1e-6) {
        throw new Refused(`Only ${round6(sold - returned)} of ${item.product.name} is left to return on this bill.`);
      }
      const amount = round2(((sold * Number(item.actualPrice) - Number(item.discount)) * line.quantity) / sold);
      lines.push({ item, quantity: line.quantity, amount });
    }
    const amount = round2(lines.reduce((s, l) => s + l.amount, 0));

    // Back the way the bill was paid, in its own proportions.
    const paid = { CASH: 0, ACCOUNT: 0, CREDIT: 0 };
    let bankAccountId: string | null = null;
    for (const p of payments) {
      paid[p.paymentMethod] += Number(p.amount);
      if (p.paymentMethod === "ACCOUNT" && p.bankAccountId) bankAccountId = p.bankAccountId;
    }
    const billTotal = paid.CASH + paid.ACCOUNT + paid.CREDIT;
    const cashRefund = billTotal > 0 ? round2((amount * paid.CASH) / billTotal) : amount;
    const accountRefund = billTotal > 0 ? round2((amount * paid.ACCOUNT) / billTotal) : 0;
    const creditReduced = round2(amount - cashRefund - accountRefund);

    const saleReturn = await tx.saleReturn.create({
      data: {
        shopId,
        dailySaleId: sale.id,
        visitAt: data.visitAt,
        customerId: sale.customerId,
        dealerId: sale.dealerId,
        returnDate,
        reference: data.reference,
        notes: data.notes || null,
        amount,
        cashRefund,
        accountRefund,
        bankAccountId: accountRefund > 0 ? bankAccountId : null,
        creditReduced,
      },
    });

    if (accountRefund > 0) {
      if (!bankAccountId) throw new Refused("The bill's bank payment has no bank account — can't refund to the bank.");
      await postToBankAccount(tx, bankAccountId, -accountRefund);
    }
    if (creditReduced > 0.004) {
      if (sale.customerId) {
        // Taken off this bill's own Udhaar charge (an IN with the sale's
        // link reduces that charge — see debts/udhaarLedger.ts).
        const charge = await tx.accountTransaction.findFirst({
          where: { linkedSaleId: sale.id, visitAt: data.visitAt, direction: "OUT" },
        });
        const accountId =
          charge?.customerAccountId ??
          (await tx.customerAccount.findFirst({ where: { customerId: sale.customerId, accountType: { isLoan: true } } }))?.id;
        if (!accountId) throw new Refused("This customer has no Udhaar account to take the return off.");
        await tx.accountTransaction.create({
          data: {
            customerAccountId: accountId,
            direction: "IN",
            amount: creditReduced,
            linkedSaleId: sale.id,
            visitAt: data.visitAt,
            transactionDate: returnDate,
            paymentMethod: "CREDIT",
            reference: data.reference,
            notes: "Sales return — taken off Udhaar",
            saleReturnId: saleReturn.id,
          },
        });
        await tx.customerAccount.update({ where: { id: accountId }, data: { currentBalance: { decrement: creditReduced } } });
      } else if (sale.dealerId) {
        const account = await tx.dealerAccount.findUniqueOrThrow({ where: { dealerId: sale.dealerId } });
        await tx.dealerTransaction.create({
          data: {
            dealerAccountId: account.id,
            direction: "OUT",
            amount: creditReduced,
            linkedSaleId: sale.id,
            visitAt: data.visitAt,
            transactionDate: returnDate,
            isDealerSale: true,
            paymentMethod: "CREDIT",
            reference: data.reference,
            notes: "Sales return — taken off what the dealer owes",
            saleReturnId: saleReturn.id,
          },
        });
        await tx.dealerAccount.update({ where: { id: account.id }, data: { currentBalance: { increment: creditReduced } } });
      }
    }

    for (const { item, quantity, amount: lineAmount } of lines) {
      const sold = Number(item.quantity);
      if (item.product.stockKind === "SIMPLE") {
        // Back into stock: the same share of what the line took.
        const stockReturned = item.stockDeducted !== null ? round6((Number(item.stockDeducted) * quantity) / sold) : 0;
        if (stockReturned > 0) {
          await tx.product.update({ where: { id: item.productId }, data: { quantity: { increment: stockReturned } } });
        }
        await tx.saleReturnItem.create({
          data: { saleReturnId: saleReturn.id, dailySaleItemId: item.id, quantity, amount: lineAmount, stockReturned },
        });
        continue;
      }
      // Grain: back into the batches it came from — a customer's
      // deposit first (that grain was owed back to them), then own.
      const returnItem = await tx.saleReturnItem.create({
        data: { saleReturnId: saleReturn.id, dailySaleItemId: item.id, quantity, amount: lineAmount },
      });
      const allocs = [...item.batchAllocations].sort(
        (a, b) => Number(!!b.grainBatch.ownerCustomerId) - Number(!!a.grainBatch.ownerCustomerId)
      );
      let left = quantity;
      for (const a of allocs) {
        if (left <= 1e-6) break;
        const q = round6(Math.min(Number(a.quantity), left));
        if (q <= 0) continue;
        await tx.dailySaleItemBatch.update({ where: { id: a.id }, data: { quantity: { decrement: q } } });
        await tx.grainBatch.update({ where: { id: a.grainBatchId }, data: { quantitySold: { decrement: q } } });
        await tx.saleReturnBatch.create({ data: { saleReturnItemId: returnItem.id, grainBatchId: a.grainBatchId, quantity: q } });
        if (a.grainBatch.ownerCustomerId) {
          await tx.stockUdhaarEntry.create({
            data: {
              customerId: a.grainBatch.ownerCustomerId,
              productId: item.productId,
              grainBatchId: a.grainBatchId,
              quantity: -q,
              linkedSaleId: sale.id,
              visitAt: data.visitAt,
              notes: "Sales return — grain back on the shelf",
            },
          });
        }
        left -= q;
      }
      await tx.dailySaleItemBatch.deleteMany({ where: { dailySaleItemId: item.id, quantity: { lte: 0 } } });
      await postToPooledGrainStock(tx, item.productId, quantity, lineAmount);
    }

    return { id: saleReturn.id, amount };
  });
}

// Undoes a sales return: the money goes back out again (bank,
// Udhaar), the goods come back off the shelf into the sale. Refused if
// returned grain has been sold again since.
export async function deleteSaleReturn(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const result = await inTransaction(async (tx) => {
    const ret = await tx.saleReturn.findFirst({
      where: { id, shopId },
      include: { items: { include: { batches: { include: { grainBatch: true } }, dailySaleItem: true } } },
    });
    if (!ret) throw new Refused("Return not found.");

    for (const item of ret.items) {
      for (const b of item.batches) {
        const batch = await tx.grainBatch.findUniqueOrThrow({ where: { id: b.grainBatchId } });
        const available =
          Number(batch.quantityIn) -
          Number(batch.quantitySold) -
          Number(batch.quantityTransferred) -
          Number(batch.quantityReturned) -
          Number(batch.quantityAtHome);
        if (available + 1e-6 < Number(b.quantity)) {
          throw new Refused("Some of the returned grain has been sold again since — this return can't be deleted.");
        }
      }
    }

    if (Number(ret.accountRefund) > 0 && ret.bankAccountId) {
      await postToBankAccount(tx, ret.bankAccountId, Number(ret.accountRefund));
    }
    for (const t of await tx.accountTransaction.findMany({ where: { saleReturnId: ret.id } })) {
      await tx.customerAccount.update({ where: { id: t.customerAccountId }, data: { currentBalance: { increment: Number(t.amount) } } });
    }
    await tx.accountTransaction.deleteMany({ where: { saleReturnId: ret.id } });
    for (const t of await tx.dealerTransaction.findMany({ where: { saleReturnId: ret.id } })) {
      await tx.dealerAccount.update({ where: { id: t.dealerAccountId }, data: { currentBalance: { decrement: Number(t.amount) } } });
    }
    await tx.dealerTransaction.deleteMany({ where: { saleReturnId: ret.id } });

    for (const item of ret.items) {
      const stockReturned = Number(item.stockReturned ?? 0);
      if (stockReturned > 0) {
        await tx.product.update({ where: { id: item.dailySaleItem.productId }, data: { quantity: { decrement: stockReturned } } });
      }
      for (const b of item.batches) {
        const q = Number(b.quantity);
        const alloc = await tx.dailySaleItemBatch.findFirst({
          where: { dailySaleItemId: item.dailySaleItemId, grainBatchId: b.grainBatchId },
        });
        if (alloc) await tx.dailySaleItemBatch.update({ where: { id: alloc.id }, data: { quantity: { increment: q } } });
        else await tx.dailySaleItemBatch.create({ data: { dailySaleItemId: item.dailySaleItemId, grainBatchId: b.grainBatchId, quantity: q } });
        await tx.grainBatch.update({ where: { id: b.grainBatchId }, data: { quantitySold: { increment: q } } });
        if (b.grainBatch.ownerCustomerId) {
          await tx.stockUdhaarEntry.create({
            data: {
              customerId: b.grainBatch.ownerCustomerId,
              productId: item.dailySaleItem.productId,
              grainBatchId: b.grainBatchId,
              quantity: q,
              linkedSaleId: ret.dailySaleId,
              visitAt: ret.visitAt,
              notes: "Sales return deleted — sold again",
            },
          });
        }
      }
      if (item.batches.length > 0 || item.stockReturned === null) {
        // Grain line: undo the pooled-stock posting too.
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.dailySaleItem.productId } });
        if (product.stockKind === "GRAIN") {
          await postToPooledGrainStock(tx, product.id, -Number(item.quantity), -Number(item.amount));
        }
      }
      await tx.saleReturnBatch.deleteMany({ where: { saleReturnItemId: item.id } });
    }
    await tx.saleReturnItem.deleteMany({ where: { saleReturnId: ret.id } });
    await tx.saleReturn.delete({ where: { id: ret.id } });
    return null;
  });
  return result;
}

// ── Purchase returns ──

export type ReturnablePurchase = {
  kind: "PRODUCT" | "GRAIN";
  id: string;
  date: Date;
  productName: string;
  unitName: string;
  quantity: number;
  returned: number;
  // Products: purchased − returned; grain: what's still in that batch.
  remaining: number;
  rate: number;
  // How it was paid: the default way the money comes back.
  paymentMethod: "CASH" | "ACCOUNT" | "CREDIT";
  bankAccountId: string | null;
};

// A dealer's purchases with what can still be sent back — the Purchase
// return form's picker. Newest first.
export async function listReturnablePurchases(dealerId: string): Promise<ReturnablePurchase[]> {
  const shopId = await getCurrentShopId();
  const dealer = await db.dealer.findFirst({
    where: { id: dealerId, shopId },
    include: { account: { include: { transactions: true } } },
  });
  if (!dealer) return [];
  const [purchases, batches] = await Promise.all([
    db.dealerProductPurchase.findMany({
      where: { dealerId },
      include: { product: { include: { unit: true } }, returns: true },
      orderBy: { purchaseDate: "desc" },
      take: 60,
    }),
    db.grainBatch.findMany({
      where: { dealerId, product: { shopId } },
      include: { product: { include: { unit: true } }, purchaseReturns: true },
      orderBy: { receivedAt: "desc" },
      take: 60,
    }),
  ]);
  const out: ReturnablePurchase[] = [];
  for (const p of purchases) {
    const returned = p.returns.reduce((s, r) => s + Number(r.quantity), 0);
    out.push({
      kind: "PRODUCT",
      id: p.id,
      date: p.purchaseDate,
      productName: p.product.name,
      unitName: p.unitName ?? p.product.unit.name,
      quantity: Number(p.quantity),
      returned: round6(returned),
      remaining: round6(Number(p.quantity) - returned),
      rate: Number(p.costPrice),
      paymentMethod: p.paymentMethod,
      bankAccountId: p.bankAccountId,
    });
  }
  for (const b of batches) {
    const amount = Number(b.quantityIn) * Number(b.rate ?? 0);
    // Its payment row was written with the batch (matched as the Grain
    // records tab does: dealer, amount, time).
    const pay = dealer.account?.transactions.find(
      (t) => t.direction === "OUT" && Math.abs(Number(t.amount) - amount) < 0.01 && Math.abs(t.transactionDate.getTime() - b.receivedAt.getTime()) < 60_000
    );
    out.push({
      kind: "GRAIN",
      id: b.id,
      date: b.receivedAt,
      productName: b.product.name,
      unitName: b.product.unit.name,
      quantity: Number(b.quantityIn),
      returned: round6(Number(b.quantityReturned)),
      remaining: round6(Number(b.quantityIn) - Number(b.quantitySold) - Number(b.quantityReturned)),
      rate: Number(b.rate ?? 0),
      paymentMethod: pay?.paymentMethod ?? "CREDIT",
      bankAccountId: pay?.bankAccountId ?? null,
    });
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Part of a dealer purchase sent back. Stock goes down by it; the money
// comes back as cash, into a bank, or as less owed to the dealer.
// Grain: only what's still in that batch can go back.
export async function createPurchaseReturn(input: PurchaseReturnInput): Promise<ActionResult<{ id: string; amount: number }>> {
  const shopId = await getCurrentShopId();
  const parsed = purchaseReturnSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const data = parsed.data;

  return inTransaction(async (tx) => {
    const returnDate = data.returnDate ? parseLocalDateNow(data.returnDate) : new Date();
    let dealerId: string;
    let productId: string;
    let rate: number;
    let stockRemoved: number;

    if (data.purchaseId) {
      const p = await tx.dealerProductPurchase.findFirst({
        where: { id: data.purchaseId, dealer: { shopId } },
        include: { returns: true, product: { include: { unit: true, subUnit: true } } },
      });
      if (!p) throw new Refused("Purchase not found.");
      const left = Number(p.quantity) - p.returns.reduce((s, r) => s + Number(r.quantity), 0);
      if (data.quantity > left + 1e-6) throw new Refused(`Only ${round6(left)} of this purchase is left to return.`);
      dealerId = p.dealerId;
      productId = p.productId;
      rate = Number(p.costPrice);
      // Stock is kept in the main unit (a Kgs purchase of a Bag product).
      const perEntered = p.unitName && subUnitsPerUnit(p.product) ? mainUnitsPer(p.product, "SUB") : 1;
      stockRemoved = round6(data.quantity * perEntered);
      await tx.product.update({ where: { id: productId }, data: { quantity: { decrement: stockRemoved } } });
    } else {
      const b = await tx.grainBatch.findFirst({ where: { id: data.grainBatchId, product: { shopId }, dealerId: { not: null } } });
      if (!b || !b.dealerId) throw new Refused("Grain purchase not found.");
      const left = Number(b.quantityIn) - Number(b.quantitySold) - Number(b.quantityReturned);
      if (data.quantity > left + 1e-6) {
        throw new Refused(`Only ${round6(left)} of this grain is still in the shop to send back.`);
      }
      dealerId = b.dealerId;
      productId = b.productId;
      rate = Number(b.rate ?? 0);
      stockRemoved = data.quantity;
      await tx.grainBatch.update({ where: { id: b.id }, data: { quantityReturned: { increment: data.quantity } } });
      await postToPooledGrainStock(tx, productId, -data.quantity, -(data.quantity * rate));
    }
    const amount = round2(data.quantity * rate);

    const ret = await tx.purchaseReturn.create({
      data: {
        shopId,
        dealerId,
        productId,
        purchaseId: data.purchaseId ?? null,
        grainBatchId: data.grainBatchId ?? null,
        quantity: data.quantity,
        stockRemoved,
        amount,
        refundMethod: data.refundMethod,
        bankAccountId: data.refundMethod === "ACCOUNT" ? data.bankAccountId : null,
        returnDate,
        reference: data.reference,
        notes: data.notes || null,
      },
    });

    if (data.refundMethod === "ACCOUNT") {
      const bank = await tx.bankAccount.findFirst({ where: { id: data.bankAccountId, shopId } });
      if (!bank) throw new Refused("Bank account not found.");
      await postToBankAccount(tx, bank.id, amount);
    } else if (data.refundMethod === "CREDIT") {
      // Less owed to the dealer: counted like a payment to them.
      const account = await tx.dealerAccount.findUniqueOrThrow({ where: { dealerId } });
      await tx.dealerTransaction.create({
        data: {
          dealerAccountId: account.id,
          direction: "IN",
          amount,
          transactionDate: returnDate,
          paymentMethod: "CREDIT",
          reference: data.reference,
          notes: "Purchase return — less owed to the dealer",
          purchaseReturnId: ret.id,
        },
      });
      await tx.dealerAccount.update({ where: { id: account.id }, data: { currentBalance: { decrement: amount } } });
    }
    return { id: ret.id, amount };
  });
}

// Undoes a purchase return: the stock comes back, the money goes back
// to how it was.
export async function deletePurchaseReturn(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  return inTransaction(async (tx) => {
    const ret = await tx.purchaseReturn.findFirst({ where: { id, shopId } });
    if (!ret) throw new Refused("Return not found.");
    const amount = Number(ret.amount);
    if (ret.refundMethod === "ACCOUNT" && ret.bankAccountId) await postToBankAccount(tx, ret.bankAccountId, -amount);
    for (const t of await tx.dealerTransaction.findMany({ where: { purchaseReturnId: ret.id } })) {
      await tx.dealerAccount.update({ where: { id: t.dealerAccountId }, data: { currentBalance: { increment: Number(t.amount) } } });
    }
    await tx.dealerTransaction.deleteMany({ where: { purchaseReturnId: ret.id } });
    if (ret.grainBatchId) {
      await tx.grainBatch.update({ where: { id: ret.grainBatchId }, data: { quantityReturned: { decrement: Number(ret.quantity) } } });
      await postToPooledGrainStock(tx, ret.productId, Number(ret.quantity), amount);
    } else {
      await tx.product.update({ where: { id: ret.productId }, data: { quantity: { increment: Number(ret.stockRemoved) } } });
    }
    await tx.purchaseReturn.delete({ where: { id: ret.id } });
    return null;
  });
}

// ── Returns page ──

export async function listReturns() {
  const shopId = await getCurrentShopId();
  const [sales, purchases] = await Promise.all([
    db.saleReturn.findMany({
      where: { shopId },
      include: {
        customer: true,
        dealer: true,
        bankAccount: true,
        items: { include: { dailySaleItem: { include: { product: { include: { unit: true } } } } } },
      },
      orderBy: { returnDate: "desc" },
      take: 300,
    }),
    db.purchaseReturn.findMany({
      where: { shopId },
      include: { dealer: true, bankAccount: true, product: { include: { unit: true } }, purchase: true },
      orderBy: { returnDate: "desc" },
      take: 300,
    }),
  ]);
  return {
    sales: sales.map((r) => ({
      id: r.id,
      date: r.returnDate,
      partyName: r.customer?.name ?? r.dealer?.name ?? "—",
      partyHref: r.customerId ? `/dashboard/customers/${r.customerId}` : `/dashboard/dealers/${r.dealerId}`,
      items: r.items.map((i) => ({
        productName: i.dailySaleItem.product.name,
        quantity: Number(i.quantity),
        unitName: i.dailySaleItem.unitName ?? i.dailySaleItem.product.unit.name,
      })),
      amount: Number(r.amount),
      cashRefund: Number(r.cashRefund),
      accountRefund: Number(r.accountRefund),
      bankAccountName: r.bankAccount?.name ?? null,
      creditReduced: Number(r.creditReduced),
      reference: r.reference,
      notes: r.notes,
    })),
    purchases: purchases.map((r) => ({
      id: r.id,
      date: r.returnDate,
      dealerName: r.dealer.name,
      dealerHref: `/dashboard/dealers/${r.dealerId}`,
      productName: r.product.name,
      quantity: Number(r.quantity),
      unitName: r.purchase?.unitName ?? r.product.unit.name,
      amount: Number(r.amount),
      refundMethod: r.refundMethod,
      bankAccountName: r.bankAccount?.name ?? null,
      reference: r.reference,
      notes: r.notes,
    })),
  };
}
