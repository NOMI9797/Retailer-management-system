"use server";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { getStockOverview } from "@/modules/stock/actions";
import { getOpeningState } from "./fills";

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: number, b: number, tolerance = 0.001) => Math.abs(a - b) <= tolerance;

export type FinalizePreview = {
  productName: string;
  unitName: string;
  udhaarKg: number;
  udhaarValue: number;
  breakEven: number;
  leftShopKg: number;
  // Each card: the register figure and what the system shows now.
  cards: { label: string; register: number | null; system: number; money?: boolean }[];
};

// Finalizes one grain's register figures as its records: the register's
// Stock Udhaar becomes the grain's opening Stock Udhaar (with its
// break-even rate), and customers' grain that the register says has
// left the shop is taken off physical stock. Every other card has to
// already agree with the records — the register figures must add up
// (customer stock − physical − advance + own = Stock Udhaar) — or it
// refuses and says which card is out. Then the register figures are put
// away (kept with the opening) and the cards show the records. With
// dryRun nothing is saved: it returns what would be done.
export async function finalizeGrainFromRegister(input: {
  productId: string;
  dryRun?: boolean;
}): Promise<ActionResult<FinalizePreview>> {
  const shopId = await getCurrentShopId();
  const product = await db.product.findFirst({
    where: { id: input.productId, shopId, stockKind: "GRAIN" },
    include: { unit: true },
  });
  if (!product) return fail("Grain not found");
  const unit = product.unit.name;

  const [register, existing, overview, advanceEntries] = await Promise.all([
    db.grainRegisterStock.findUnique({ where: { shopId_productId: { shopId, productId: product.id } } }),
    db.grainOpening.findFirst({ where: { shopId, productId: product.id } }),
    getStockOverview(product.id),
    db.grainAdvanceRegister.aggregate({ where: { shopId, productId: product.id }, _sum: { kg: true } }),
  ]);
  if (existing) return fail(`${product.name} is already finalized.`);
  if (!register) return fail(`${product.name} has no register figures to finalize.`);

  const fig = (v: Prisma.Decimal | null) => (v != null ? Number(v) : null);
  const reg = {
    ownKg: fig(register.ownKg),
    ownValue: fig(register.ownValue),
    customerKg: fig(register.customerKg),
    physicalKg: fig(register.physicalKg),
    stockUdhaarKg: fig(register.stockUdhaarKg),
    stockUdhaarValue: fig(register.stockUdhaarValue),
    advanceKg: fig(register.advanceKg),
    borrowedKg: fig(register.borrowedKg),
  };
  const sys = {
    ownKg: overview.ownAvailable,
    ownValue: overview.ownValue,
    customerKg: overview.customerClaim,
    physicalKg: overview.totalPhysical,
    stockUdhaarKg: overview.stockUdhaarOutstanding,
    advanceKg: round3(overview.lentOut + overview.atCustomerHomes + Number(advanceEntries._sum.kg ?? 0)),
    borrowedKg: overview.borrowed,
  };
  // A card left blank in the register is taken as the records' figure.
  const orRecords = (r: number | null, s: number) => r ?? s;

  // Cards that have to match the records already.
  const mustMatch: [string, number | null, number, boolean?][] = [
    ["Own stock", reg.ownKg, sys.ownKg],
    ["Stock value", reg.ownValue, sys.ownValue, true],
    ["Customer stock", reg.customerKg, sys.customerKg],
    ["Advance stock", reg.advanceKg, sys.advanceKg],
    ["Borrowed (loans)", reg.borrowedKg, sys.borrowedKg],
  ];
  for (const [label, r, s, money] of mustMatch) {
    if (r !== null && !same(r, s, money ? 1 : 0.001)) {
      return fail(
        `${label} doesn't match the records yet — register ${money ? `Rs ${r.toLocaleString()}` : `${r} ${unit}`}, system ${money ? `Rs ${s.toLocaleString()}` : `${s} ${unit}`}. Bring these in line first.`
      );
    }
  }
  if (sys.stockUdhaarKg > 0.0005) {
    return fail(`${product.name} already has Stock Udhaar in the records (${sys.stockUdhaarKg} ${unit}) — settle that first.`);
  }

  const udhaarKg = round3(orRecords(reg.stockUdhaarKg, 0));
  const udhaarValue = round2(orRecords(reg.stockUdhaarValue, 0));
  const physical = orRecords(reg.physicalKg, sys.physicalKg);
  // The register's own logic: what customers are owed, less what's in
  // the shop and the shop's grain at their homes, is grain already sold.
  const expectedUdhaar = round3(orRecords(reg.customerKg, sys.customerKg) - physical - orRecords(reg.advanceKg, sys.advanceKg) + orRecords(reg.ownKg, sys.ownKg));
  if (!same(expectedUdhaar, udhaarKg)) {
    return fail(
      `The register figures don't add up: customer stock − total physical − advance + own stock = ${expectedUdhaar} ${unit}, but Stock Udhaar is ${udhaarKg} ${unit}.`
    );
  }
  if (udhaarKg > 0 && udhaarValue <= 0) return fail("Enter the Stock Udhaar value first — it sets the break-even rate.");
  const leftShopKg = round3(sys.physicalKg - physical);
  if (leftShopKg < -0.0005) {
    return fail(`Total physical in the register (${physical} ${unit}) is more than the records hold (${sys.physicalKg} ${unit}).`);
  }

  const preview: FinalizePreview = {
    productName: product.name,
    unitName: unit,
    udhaarKg,
    udhaarValue,
    breakEven: udhaarKg > 0 ? round2(udhaarValue / udhaarKg) : 0,
    leftShopKg: Math.max(leftShopKg, 0),
    cards: [
      { label: "Own stock", register: reg.ownKg, system: sys.ownKg },
      { label: "Stock value", register: reg.ownValue, system: sys.ownValue, money: true },
      { label: "Customer stock", register: reg.customerKg, system: sys.customerKg },
      { label: "Total physical", register: reg.physicalKg, system: sys.physicalKg },
      { label: "Stock Udhaar", register: reg.stockUdhaarKg, system: sys.stockUdhaarKg },
      { label: "Stock Udhaar value", register: reg.stockUdhaarValue, system: 0, money: true },
      { label: "Advance stock", register: reg.advanceKg, system: sys.advanceKg },
      { label: "Borrowed (loans)", register: reg.borrowedKg, system: sys.borrowedKg },
    ],
  };
  if (input.dryRun) return ok(preview);

  await db.$transaction(async (tx) => {
    await tx.grainOpening.create({
      data: {
        shopId,
        productId: product.id,
        udhaarKg,
        udhaarValue,
        leftShopKg: Math.max(leftShopKg, 0),
        register: { ...reg, finalizedSystem: sys },
      },
    });
    await tx.grainRegisterStock.delete({ where: { id: register.id } });
  });
  return ok(preview);
}

export type GrainOpeningFillRow = { id: string; date: Date; kg: number; rate: number; gain: number };

// A finalized grain's opening Stock Udhaar: what was owed, its
// break-even rate, and each fill since — the profit / loss on each.
export async function getGrainOpening(productId: string) {
  const shopId = await getCurrentShopId();
  const opening = await db.grainOpening.findFirst({
    where: { shopId, productId },
    include: { fills: { orderBy: { createdAt: "desc" } } },
  });
  if (!opening) return null;
  const state = (await getOpeningState(db as unknown as Prisma.TransactionClient, productId))!;
  const fills: GrainOpeningFillRow[] = opening.fills.map((f) => ({
    id: f.id,
    date: f.createdAt,
    kg: Number(f.kg),
    rate: Number(f.rate),
    gain: round2((state.breakEven - Number(f.rate)) * Number(f.kg)),
  }));
  return { ...state, fills, gain: round2(fills.reduce((s, f) => s + f.gain, 0)) };
}
