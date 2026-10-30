"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { getStockOverview } from "@/modules/stock/actions";
import { grainBreakEven, grainSeasonTotals, stockUdhaarValue } from "./seasonTotals";
import { getGrainOpening } from "@/modules/grain-opening/actions";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// What the current season needs before it can be closed — each one a
// reason the Close season button explains when it's not ready yet.
export type GrainSeasonBlocker = "OWN_STOCK" | "STOCK_UDHAAR" | "LENT_OUT" | "BORROWED";

// One grain's open season, the simple way: money paid for the grain and
// money received for it. Stock comes and goes with every purchase, sale,
// pickup and Stock Udhaar fill, and the break-even rate follows the
// money (see grainBreakEven) — but profit / loss is only worked out when
// the season closes: money received − money paid. Closed seasons are
// kept as they stood.
export async function getGrainAccount(productId: string) {
  const shopId = await getCurrentShopId();
  const product = await db.product.findFirst({
    where: { id: productId, shopId, stockKind: "GRAIN" },
    include: { unit: true },
  });
  if (!product) throw new Error("Grain not found");

  const [{ season, closed, lastClosed, moves, opening }, overview, openingDetail] = await Promise.all([
    grainSeasonTotals(shopId, productId),
    getStockOverview(productId),
    getGrainOpening(productId),
  ]);

  const stockValue = overview.ownValue;
  const ownKg = overview.ownAvailable;
  // Customers' Stock Udhaar plus the opening Stock Udhaar still to buy back.
  const stockUdhaar = round3(overview.stockUdhaarOutstanding + (opening?.remainingKg ?? 0));
  const breakEven = grainBreakEven({ paid: season.paid, received: season.received, owedKg: stockUdhaar, ownKg });

  const blockers: GrainSeasonBlocker[] = [];
  if (Math.abs(overview.ownAvailable - overview.lentOut) > 0.0005) blockers.push("OWN_STOCK");
  if (stockUdhaar > 0.0005) blockers.push("STOCK_UDHAAR");
  if (overview.lentOut > 0.0005) blockers.push("LENT_OUT");
  if (overview.borrowed > 0.0005) blockers.push("BORROWED");

  return {
    product: { id: product.id, name: product.name, unitName: product.unit.name },
    seasonNumber: (closed[0]?.seasonNumber ?? 0) + 1,
    seasonStartedAt: lastClosed ?? (moves.length > 0 ? new Date(Math.min(...moves.map((m) => m.date.getTime()))) : null),
    season,
    stockValue,
    // The season's result if it closed now: money received − money paid.
    // Only shown (and saved) when the season closes.
    result: round2(season.received - season.paid),
    ownKg,
    // Shop's grain on its shelf (excludes Advance stock: out on loan,
    // or bought but still at the seller's home).
    shelfKg: round3(overview.ownAvailable - overview.lentOut - overview.atCustomerHomes),
    stockUdhaar,
    stockUdhaarValue: stockUdhaarValue({ paid: season.paid, received: season.received, owedKg: stockUdhaar }),
    lentOut: overview.lentOut,
    atCustomerHomes: overview.atCustomerHomes,
    borrowed: overview.borrowed,
    breakEven,
    // The opening Stock Udhaar from the register and what's been bought
    // back of it (kg and rate paid), when this season holds it.
    opening: opening ? openingDetail : null,
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

// The break-even rate and Stock Udhaar value of one grain, for its
// Grain page cards.
export async function getGrainBreakEven(productId: string) {
  const shopId = await getCurrentShopId();
  const [{ season, opening }, overview] = await Promise.all([grainSeasonTotals(shopId, productId), getStockOverview(productId)]);
  const owedKg = round3(overview.stockUdhaarOutstanding + (opening?.remainingKg ?? 0));
  return {
    breakEven: grainBreakEven({ paid: season.paid, received: season.received, owedKg, ownKg: overview.ownAvailable }),
    stockUdhaarValue: stockUdhaarValue({ paid: season.paid, received: season.received, owedKg }),
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
        // Simple: money received − money paid this season.
        result: account.result,
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
