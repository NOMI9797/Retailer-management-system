import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { lentCostRates } from "@/modules/stock/grainFifo";

// Every money movement in a grain's running account — the shop's grain
// profit / loss, worked the way a shopkeeper works it: money paid for
// the grain on one side, money received for it on the other; whatever
// is left over is profit (or, if negative, loss still to recover).
//   Paid:     every grain purchase — own stock added with a rate (Add
//             batch), grain bought from a dealer, a customer's grain
//             bought (settling its rate, incl. grain bought to fill
//             Stock Udhaar) — and money the shop pays for borrowed
//             bags instead of giving them back.
//   Received: every sale of the grain (after discount), and money a
//             party pays for lent bags instead of giving them back.
// Grain moving without money (loans returned in grain, deposits, grain
// given back unsettled) doesn't count. Not a "use server" module — it
// takes a shopId (same reason as ledger/ledgerRows.ts).

export type GrainMoveKind =
  | "PURCHASE"
  | "SALE"
  | "LOAN_PAID_TO_SHOP"
  | "LOAN_PAID_BY_SHOP"
  // Negative amounts: money given back on a sales return, money got
  // back on a purchase return.
  | "SALE_RETURN"
  | "PURCHASE_RETURN";

export type GrainMove = {
  productId: string;
  date: Date;
  kind: GrainMoveKind;
  // "PAID" = money out for this grain, "RECEIVED" = money in for it.
  side: "PAID" | "RECEIVED";
  amount: number;
  quantity: number;
};

export async function collectGrainMoves(
  shopId: string,
  options?: { productId?: string; range?: { gte: Date; lte: Date } }
): Promise<GrainMove[]> {
  const productId = options?.productId;
  const range = options?.range;

  const [batches, saleItems, loanReturns, saleReturnItems, purchaseReturns] = await Promise.all([
    // Shop-owned batches that cost money. A grain-loan batch (borrowed
    // grain, or lent grain coming back) cost nothing.
    db.grainBatch.findMany({
      where: {
        productId,
        product: { shopId, stockKind: "GRAIN" },
        ownerCustomerId: null,
        grainLoanId: null,
        grainLoanReturnId: null,
        // What grain waste left behind is grain already paid for.
        grainWasteId: null,
        rate: { not: null },
        receivedAt: range,
      },
      select: { productId: true, receivedAt: true, quantityIn: true, rate: true },
    }),
    db.dailySaleItem.findMany({
      where: {
        productId,
        product: { shopId, stockKind: "GRAIN" },
        visitAt: range,
      },
      select: { productId: true, visitAt: true, quantity: true, actualPrice: true, discount: true },
    }),
    db.grainLoanReturn.findMany({
      where: { shopId, amount: { gt: 0 }, returnDate: range, grainLoan: { productId } },
      select: {
        returnDate: true,
        amount: true,
        quantityPaid: true,
        grainLoan: { select: { productId: true, direction: true } },
      },
    }),
    db.saleReturnItem.findMany({
      where: {
        saleReturn: { shopId, returnDate: range },
        dailySaleItem: { productId, product: { stockKind: "GRAIN" } },
      },
      select: { quantity: true, amount: true, saleReturn: { select: { returnDate: true } }, dailySaleItem: { select: { productId: true } } },
    }),
    db.purchaseReturn.findMany({
      where: { shopId, productId, returnDate: range, grainBatchId: { not: null } },
      select: { productId: true, returnDate: true, quantity: true, amount: true },
    }),
  ]);

  const moves: GrainMove[] = [];
  for (const r of saleReturnItems) {
    moves.push({
      productId: r.dailySaleItem.productId,
      date: r.saleReturn.returnDate,
      kind: "SALE_RETURN",
      side: "RECEIVED",
      amount: -Number(r.amount),
      quantity: -Number(r.quantity),
    });
  }
  for (const r of purchaseReturns) {
    moves.push({
      productId: r.productId,
      date: r.returnDate,
      kind: "PURCHASE_RETURN",
      side: "PAID",
      amount: -Number(r.amount),
      quantity: -Number(r.quantity),
    });
  }
  for (const b of batches) {
    const quantity = Number(b.quantityIn);
    moves.push({
      productId: b.productId,
      date: b.receivedAt,
      kind: "PURCHASE",
      side: "PAID",
      amount: quantity * Number(b.rate),
      quantity,
    });
  }
  for (const item of saleItems) {
    const quantity = Number(item.quantity);
    moves.push({
      productId: item.productId,
      date: item.visitAt,
      kind: "SALE",
      side: "RECEIVED",
      amount: quantity * Number(item.actualPrice) - Number(item.discount),
      quantity,
    });
  }
  for (const r of loanReturns) {
    const lent = r.grainLoan.direction === "SHOP_LENT";
    moves.push({
      productId: r.grainLoan.productId,
      date: r.returnDate,
      // Lent bags paid for = the shop sold them; borrowed bags paid
      // for = the shop bought them.
      kind: lent ? "LOAN_PAID_TO_SHOP" : "LOAN_PAID_BY_SHOP",
      side: lent ? "RECEIVED" : "PAID",
      amount: Number(r.amount),
      quantity: Number(r.quantityPaid),
    });
  }
  return moves;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type GrainMoveTotals = {
  paid: number;
  received: number;
  // received − paid: above 0 profit so far, below 0 loss to recover.
  result: number;
  kgBought: number;
  kgSold: number;
};

export function totalGrainMoves(moves: GrainMove[]): GrainMoveTotals {
  let paid = 0;
  let received = 0;
  let kgBought = 0;
  let kgSold = 0;
  for (const m of moves) {
    if (m.side === "PAID") {
      paid += m.amount;
      kgBought += m.quantity;
    } else {
      received += m.amount;
      kgSold += m.quantity;
    }
  }
  return {
    paid: round2(paid),
    received: round2(received),
    result: round2(received - paid),
    kgBought: round3(kgBought),
    kgSold: round3(kgSold),
  };
}

// ── Profit made, entry by entry ──
// The profit side of the account: each grain sale's money less what
// the grain it took had cost (each batch it came from × that batch's
// rate), and each grain-loan settlement in money less the bags' agreed
// value. Grain sold from a customer's deposit has no cost until the
// shop buys it — then that sale is moved onto the purchase batch and
// picks up its rate. Summed over a season this is received − paid +
// the grain still in hand, worked out a day at a time.

export type GrainProfitEntry = {
  productId: string;
  date: Date;
  kind: "SALE" | "LOAN_PAID_TO_SHOP" | "LOAN_PAID_BY_SHOP" | "SALE_RETURN";
  // Money for the grain, and what that grain cost the shop.
  revenue: number;
  cost: number;
  profit: number;
  // Kg sold that have no cost yet (customer grain not bought yet).
  uncostedKg: number;
};

export async function collectGrainProfit(
  shopId: string,
  options?: { productId?: string; range?: { gte: Date; lte: Date } }
): Promise<GrainProfitEntry[]> {
  const productId = options?.productId;
  const range = options?.range;
  const [items, loanReturns, saleReturnItems] = await Promise.all([
    db.dailySaleItem.findMany({
      where: { productId, product: { shopId, stockKind: "GRAIN" }, visitAt: range },
      select: {
        productId: true,
        visitAt: true,
        quantity: true,
        actualPrice: true,
        discount: true,
        batchAllocations: { select: { quantity: true, grainBatchId: true, grainBatch: { select: { rate: true, ownerCustomerId: true } } } },
        // Grain later returned went back into these batches (taken off
        // the allocations) — its cost still belongs to the sale's day.
        returnItems: {
          select: { batches: { select: { quantity: true, grainBatch: { select: { rate: true, ownerCustomerId: true } } } } },
        },
      },
    }),
    db.grainLoanReturn.findMany({
      where: { shopId, amount: { gt: 0 }, returnDate: range, grainLoan: { productId } },
      select: {
        returnDate: true,
        amount: true,
        quantityPaid: true,
        grainLoan: { select: { id: true, productId: true, direction: true, rate: true } },
      },
    }),
    db.saleReturnItem.findMany({
      where: {
        saleReturn: { shopId, returnDate: range },
        dailySaleItem: { productId, product: { stockKind: "GRAIN" } },
      },
      select: {
        amount: true,
        saleReturn: { select: { returnDate: true } },
        dailySaleItem: { select: { productId: true } },
        batches: { select: { quantity: true, grainBatch: { select: { rate: true, ownerCustomerId: true } } } },
      },
    }),
  ]);
  // Lent bags paid for are weighed against what that grain cost.
  const lentCost = await lentCostRates(
    db as unknown as Prisma.TransactionClient,
    loanReturns.filter((r) => r.grainLoan.direction === "SHOP_LENT").map((r) => r.grainLoan)
  );

  // A deposit the shop bought beyond what was left of it (recorded
  // before purchases moved the earlier sales) — that much of its sold
  // grain was paid for at the deposit's purchase rate.
  const overBought = new Map<string, { kg: number; rate: number }>();
  const depositIds = [
    ...new Set(items.flatMap((i) => i.batchAllocations.filter((a) => a.grainBatch.ownerCustomerId).map((a) => a.grainBatchId))),
  ];
  if (depositIds.length > 0) {
    const deposits = await db.grainBatch.findMany({ where: { id: { in: depositIds } } });
    for (const d of deposits) {
      const remaining =
        Number(d.quantityIn) - Number(d.quantitySold) - Number(d.quantityTransferred) - Number(d.quantityReturned);
      if (remaining < -0.0001 && d.rate !== null) overBought.set(d.id, { kg: -remaining, rate: Number(d.rate) });
    }
  }

  const entries: GrainProfitEntry[] = [];
  for (const item of items) {
    const revenue = Number(item.quantity) * Number(item.actualPrice) - Number(item.discount);
    let cost = 0;
    let uncostedKg = 0;
    for (const a of item.batchAllocations) {
      const q = Number(a.quantity);
      if (a.grainBatch.ownerCustomerId) {
        const ob = overBought.get(a.grainBatchId);
        const costed = ob ? Math.min(ob.kg, q) : 0;
        if (ob && costed > 0) {
          cost += costed * ob.rate;
          ob.kg -= costed;
        }
        uncostedKg += q - costed;
      } else if (a.grainBatch.rate === null) uncostedKg += q;
      else cost += q * Number(a.grainBatch.rate);
    }
    for (const r of item.returnItems) {
      for (const b of r.batches) {
        if (!b.grainBatch.ownerCustomerId && b.grainBatch.rate !== null) cost += Number(b.quantity) * Number(b.grainBatch.rate);
      }
    }
    entries.push({
      productId: item.productId,
      date: item.visitAt,
      kind: "SALE",
      revenue: round2(revenue),
      cost: round2(cost),
      profit: round2(revenue - cost),
      uncostedKg: round3(uncostedKg),
    });
  }
  // A sales return: the money given back, less what that grain cost
  // (it's back in stock at that cost) — the sale's profit undone on
  // the day it came back.
  for (const r of saleReturnItems) {
    const cost = r.batches.reduce(
      (s, b) => s + (!b.grainBatch.ownerCustomerId && b.grainBatch.rate !== null ? Number(b.quantity) * Number(b.grainBatch.rate) : 0),
      0
    );
    entries.push({
      productId: r.dailySaleItem.productId,
      date: r.saleReturn.returnDate,
      kind: "SALE_RETURN",
      revenue: round2(-Number(r.amount)),
      cost: round2(-cost),
      profit: round2(cost - Number(r.amount)),
      uncostedKg: 0,
    });
  }
  for (const r of loanReturns) {
    const lent = r.grainLoan.direction === "SHOP_LENT";
    const perKg = lent ? (lentCost.get(r.grainLoan.id) ?? Number(r.grainLoan.rate)) : Number(r.grainLoan.rate);
    const value = Number(r.quantityPaid) * perKg;
    const amount = Number(r.amount);
    entries.push({
      productId: r.grainLoan.productId,
      date: r.returnDate,
      kind: lent ? "LOAN_PAID_TO_SHOP" : "LOAN_PAID_BY_SHOP",
      // Lent bags paid for: sold at `amount`, they were worth `value`.
      // Borrowed bags paid for: owed `value` of grain, settled by paying `amount`.
      revenue: round2(lent ? amount : value),
      cost: round2(lent ? value : amount),
      profit: round2(lent ? amount - value : value - amount),
      uncostedKg: 0,
    });
  }
  return entries;
}
