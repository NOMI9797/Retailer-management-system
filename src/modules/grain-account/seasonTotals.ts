import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getOpeningState, type OpeningState } from "@/modules/grain-opening/fills";
import { collectGrainMoves, totalGrainMoves, type GrainMoveTotals } from "./grainMoves";

// One grain's money for its open season, worked the simple way: money
// paid for the grain and money received for it. Profit / loss is only
// worked out when the season closes (received − paid); until then these
// two only set the break-even rate. Not a "use server" module — it takes
// a shopId (same reason as grainMoves.ts).

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function grainSeasonTotals(shopId: string, productId: string) {
  const [moves, closed, openingAll] = await Promise.all([
    collectGrainMoves(shopId, { productId }),
    db.grainSeason.findMany({ where: { shopId, productId }, orderBy: { seasonNumber: "desc" } }),
    getOpeningState(db as unknown as Prisma.TransactionClient, productId),
  ]);

  // The open season = all-time figures less the closed seasons', so an
  // entry dated back into a closed season still lands somewhere (here).
  const allTime = totalGrainMoves(moves);
  const closedSum = closed.reduce(
    (s, c) => ({
      paid: s.paid + Number(c.moneyPaid),
      received: s.received + Number(c.moneyReceived),
      kgBought: s.kgBought + Number(c.kgBought),
      kgSold: s.kgSold + Number(c.kgSold),
    }),
    { paid: 0, received: 0, kgBought: 0, kgSold: 0 }
  );
  const season: GrainMoveTotals = {
    paid: round2(allTime.paid - closedSum.paid),
    received: round2(allTime.received - closedSum.received),
    result: round2(allTime.received - closedSum.received - (allTime.paid - closedSum.paid)),
    kgBought: round3(allTime.kgBought - closedSum.kgBought),
    kgSold: round3(allTime.kgSold - closedSum.kgSold),
  };

  // A grain finalized from the register: its opening Stock Udhaar was
  // grain already sold, so what it sold for counts as money received in
  // the season it was finalized in (a later closed season holds it).
  const lastClosed = closed[0]?.closedAt ?? null;
  const opening: OpeningState | null =
    openingAll && (!lastClosed || openingAll.openedAt > lastClosed) ? openingAll : null;
  if (opening) {
    season.received = round2(season.received + opening.udhaarValue);
    season.result = round2(season.result + opening.udhaarValue);
  }
  return { season, closed, lastClosed, moves, opening };
}

export type GrainBreakEven =
  // Grain still owed to customers (Stock Udhaar): the most the shop can
  // pay per kg to buy it back and still come out even.
  | { kind: "BUY_BELOW"; rate: number; owedKg: number }
  // The shop holds grain of its own: what it must sell at to get back
  // what's been spent.
  | { kind: "SELL_ABOVE"; rate: number; ownKg: number }
  // More received than paid already.
  | { kind: "RECOVERED"; surplus: number }
  // Nothing left to sell or buy back, and less received than paid.
  | { kind: "SHORT"; short: number };

// The break-even rate from the season's money and what's held or owed.
export function grainBreakEven(input: { paid: number; received: number; owedKg: number; ownKg: number }): GrainBreakEven {
  const left = round2(input.received - input.paid);
  if (input.owedKg > 0.0005) return { kind: "BUY_BELOW", rate: round2(left / input.owedKg), owedKg: input.owedKg };
  if (input.ownKg > 0.0005 && left < 0) return { kind: "SELL_ABOVE", rate: round2(-left / input.ownKg), ownKg: input.ownKg };
  if (left >= 0) return { kind: "RECOVERED", surplus: left };
  return { kind: "SHORT", short: -left };
}

// What the grain owed to customers (Stock Udhaar) is worth: the money
// received and not yet spent buying grain — the kg owed × the break-even
// rate. Null when nothing is owed.
export function stockUdhaarValue(input: { paid: number; received: number; owedKg: number }): number | null {
  if (input.owedKg <= 0.0005) return null;
  return round2(Math.max(input.received - input.paid, 0));
}
