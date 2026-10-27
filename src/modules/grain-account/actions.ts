"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { toLocalDateString } from "@/lib/utils";
import { getStockOverview } from "@/modules/stock/actions";
import { collectGrainMoves, collectGrainProfit, totalGrainMoves, type GrainMoveTotals } from "./grainMoves";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type GrainSeasonDay = {
  date: string; // "YYYY-MM-DD"
  // What that day's grain sold for, and what that grain had cost.
  soldFor: number;
  cost: number;
  // soldFor − cost: profit (▲) or loss (▼) made that day.
  change: number;
  // Kg sold that day with no cost yet (customer grain not bought).
  uncostedKg: number;
  // The season's profit / loss at the end of that day.
  resultAfter: number;
};

// What the current season needs before it can be closed — each one a
// reason the Close season button explains when it's not ready yet.
export type GrainSeasonBlocker = "OWN_STOCK" | "STOCK_UDHAAR" | "LENT_OUT" | "BORROWED";

// One grain's running profit / loss for its open season:
//   profit / loss = money received − money paid + the grain still in
//   hand at what it cost (stock value)
// — so buying grain is never a loss (the money just became stock); a
// sale counts its profit over what that grain cost. Plus what's
// needed to judge it: the grain the shop still holds and the rate it
// must sell that grain above to come out ahead (break-even), each day's
// movement, and the closed seasons before it. Closed seasons are kept
// as they stood; the open season is everything since — worked out as
// all-time figures less the closed seasons', so an entry dated back
// into a closed season still lands somewhere (here).
export async function getGrainAccount(productId: string) {
  const shopId = await getCurrentShopId();
  const product = await db.product.findFirst({
    where: { id: productId, shopId, stockKind: "GRAIN" },
    include: { unit: true },
  });
  if (!product) throw new Error("Grain not found");

  const [moves, profitEntries, closed, overview] = await Promise.all([
    collectGrainMoves(shopId, { productId }),
    collectGrainProfit(shopId, { productId }),
    db.grainSeason.findMany({ where: { shopId, productId }, orderBy: { seasonNumber: "desc" } }),
    getStockOverview(productId),
  ]);

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

  // The headline: received − paid + what the grain in hand cost.
  const stockValue = overview.ownValue;
  const profit = round2(season.result + stockValue);

  // While the shop still owes customers grain it sold (Stock Udhaar),
  // that grain has no cost yet, so the headline is too high by what
  // buying it will cost. An estimate prices it at the last rate the
  // shop paid for this grain — a guess, shown beside the real figure.
  let estimate: { rate: number; kg: number; profit: number } | null = null;
  if (overview.stockUdhaarOutstanding > 0.0005) {
    const last = await db.grainBatch.findFirst({
      where: { productId, ownerCustomerId: null, grainLoanId: null, grainLoanReturnId: null, rate: { not: null } },
      orderBy: { receivedAt: "desc" },
      select: { rate: true },
    });
    if (last?.rate != null) {
      const rate = Number(last.rate);
      const kg = overview.stockUdhaarOutstanding;
      estimate = { rate, kg, profit: round2(profit - kg * rate) };
    }
  }

  // Day by day since the last close, newest first: each day's grain
  // sold for, what that grain had cost, the profit made, and the
  // season's profit at the end of the day.
  const lastClosedAt = closed[0]?.closedAt ?? null;
  const byDay = new Map<string, { soldFor: number; cost: number; uncostedKg: number }>();
  for (const e of profitEntries) {
    if (lastClosedAt && e.date <= lastClosedAt) continue;
    const day = toLocalDateString(e.date);
    const d = byDay.get(day) ?? { soldFor: 0, cost: 0, uncostedKg: 0 };
    d.soldFor += e.revenue;
    d.cost += e.cost;
    d.uncostedKg += e.uncostedKg;
    byDay.set(day, d);
  }
  const daysAsc = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  // Anything the days don't explain (lent grain valued at the loan's
  // agreed rate rather than what it cost, an entry dated back before
  // the last close…) — shown as an opening line, so each day's
  // "season so far" ends at the headline.
  const otherAdjustments = round2(profit - daysAsc.reduce((s, [, d]) => s + d.soldFor - d.cost, 0));
  let running = otherAdjustments;
  const days: GrainSeasonDay[] = daysAsc
    .map(([date, d]) => {
      running += d.soldFor - d.cost;
      return {
        date,
        soldFor: round2(d.soldFor),
        cost: round2(d.cost),
        change: round2(d.soldFor - d.cost),
        uncostedKg: round3(d.uncostedKg),
        resultAfter: round2(running),
      };
    })
    .reverse();

  // The grain the shop holds (lent-out grain included — it's coming
  // back) and the rate it must fetch to come out even.
  const ownKg = overview.ownAvailable;
  const toRecover = round2(-season.result);
  const breakEvenRate = toRecover > 0 && ownKg > 0.0001 ? round2(toRecover / ownKg) : null;

  const blockers: GrainSeasonBlocker[] = [];
  if (Math.abs(overview.ownAvailable - overview.lentOut) > 0.0005) blockers.push("OWN_STOCK");
  if (overview.stockUdhaarOutstanding > 0.0005) blockers.push("STOCK_UDHAAR");
  if (overview.lentOut > 0.0005) blockers.push("LENT_OUT");
  if (overview.borrowed > 0.0005) blockers.push("BORROWED");

  return {
    product: { id: product.id, name: product.name, unitName: product.unit.name },
    seasonNumber: (closed[0]?.seasonNumber ?? 0) + 1,
    seasonStartedAt: lastClosedAt ?? (moves.length > 0 ? new Date(Math.min(...moves.map((m) => m.date.getTime()))) : null),
    season,
    stockValue,
    // received − paid + stock value: above 0 profit, below 0 loss.
    profit,
    estimate,
    otherAdjustments,
    uncostedKg: round3(daysAsc.reduce((s, [, d]) => s + d.uncostedKg, 0)),
    ownKg,
    // Shop's grain on its shelf (excludes Advance stock out on loan).
    shelfKg: round3(overview.ownAvailable - overview.lentOut),
    stockUdhaar: overview.stockUdhaarOutstanding,
    lentOut: overview.lentOut,
    borrowed: overview.borrowed,
    toRecover,
    breakEvenRate,
    days,
    blockers,
    closedSeasons: closed.map((c) => ({
      id: c.id,
      seasonNumber: c.seasonNumber,
      startedAt: c.startedAt,
      closedAt: c.closedAt,
      paid: Number(c.moneyPaid),
      received: Number(c.moneyReceived),
      result: Number(c.result),
      kgBought: Number(c.kgBought),
      kgSold: Number(c.kgSold),
      notes: c.notes,
    })),
  };
}

const BLOCKER_TEXT: Record<GrainSeasonBlocker, string> = {
  OWN_STOCK: "the shop still has some of its own grain",
  STOCK_UDHAAR: "grain sold from customers (Stock Udhaar) hasn't been bought yet",
  LENT_OUT: "grain lent out hasn't all come back",
  BORROWED: "borrowed grain hasn't all been given back",
};

// Close season: saves this grain's season result as final and starts
// a new season from zero. Only once the shop holds none of the grain
// and owes / is owed none — so nothing still to buy or sell can change
// the figure afterwards.
export async function closeGrainSeason(input: { productId: string; notes?: string }): Promise<ActionResult<{ seasonNumber: number; result: number }>> {
  const shopId = await getCurrentShopId();
  const account = await getGrainAccount(input.productId);
  if (account.blockers.length > 0) {
    return fail(`Can't close the season yet — ${account.blockers.map((b) => BLOCKER_TEXT[b]).join("; ")}.`);
  }
  if (account.season.paid === 0 && account.season.received === 0) {
    return fail("Nothing has been bought or sold this season.");
  }

  try {
    const saved = await db.grainSeason.create({
      data: {
        shopId,
        productId: input.productId,
        seasonNumber: account.seasonNumber,
        startedAt: account.seasonStartedAt,
        moneyPaid: account.season.paid,
        moneyReceived: account.season.received,
        result: account.profit,
        kgBought: account.season.kgBought,
        kgSold: account.season.kgSold,
        notes: input.notes?.trim() || null,
      },
    });
    return ok({ seasonNumber: saved.seasonNumber, result: Number(saved.result) });
  } catch {
    return fail("This season was just closed — refresh the page.");
  }
}
