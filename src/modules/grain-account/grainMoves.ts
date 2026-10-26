import { db } from "@/lib/db";

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

export type GrainMoveKind = "PURCHASE" | "SALE" | "LOAN_PAID_TO_SHOP" | "LOAN_PAID_BY_SHOP";

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

  const [batches, saleItems, loanReturns] = await Promise.all([
    // Shop-owned batches that cost money. A grain-loan batch (borrowed
    // grain, or lent grain coming back) cost nothing.
    db.grainBatch.findMany({
      where: {
        productId,
        product: { shopId, stockKind: "GRAIN" },
        ownerCustomerId: null,
        grainLoanId: null,
        grainLoanReturnId: null,
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
  ]);

  const moves: GrainMove[] = [];
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
