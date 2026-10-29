import type { Prisma } from "@prisma/client";

// A grain's opening Stock Udhaar (GrainOpening) and the new stock that
// fills it. Not a "use server" module — every function takes the
// transaction it runs in (same reason as stock/grainFifo.ts).

type Tx = Prisma.TransactionClient;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type OpeningState = {
  id: string;
  openedAt: Date;
  // From the register.
  udhaarKg: number;
  udhaarValue: number;
  // Wasted since out of customers' grain (the shop's own ran out): owed
  // back too, valued at the break-even rate of the day — a loss.
  wastedKg: number;
  wastedValue: number;
  // Everything owed: udhaarKg + wastedKg.
  totalKg: number;
  // (udhaarValue + wastedValue) ÷ totalKg: what each kg owed is worth.
  breakEven: number;
  leftShopKg: number;
  filledKg: number;
  remainingKg: number;
  // remainingKg × breakEven: the money still to be spent buying it back
  // at break-even.
  remainingValue: number;
};

// One grain's opening position and how much of it has been filled, or
// null when the grain hasn't been finalized from the register.
export async function getOpeningState(tx: Tx, productId: string): Promise<OpeningState | null> {
  const opening = await tx.grainOpening.findFirst({ where: { productId }, include: { fills: true } });
  if (!opening) return null;
  const wastes = await tx.grainWaste.findMany({
    where: { productId, fromCustomersKg: { gt: 0 } },
    select: { fromCustomersKg: true, customerRate: true },
  });
  const udhaarKg = Number(opening.udhaarKg);
  const udhaarValue = Number(opening.udhaarValue);
  const wastedKg = round3(wastes.reduce((s, w) => s + Number(w.fromCustomersKg), 0));
  const wastedValue = round2(wastes.reduce((s, w) => s + Number(w.fromCustomersKg) * Number(w.customerRate ?? 0), 0));
  const totalKg = round3(udhaarKg + wastedKg);
  const breakEven = totalKg > 0 ? (udhaarValue + wastedValue) / totalKg : 0;
  const filledKg = round3(opening.fills.reduce((s, f) => s + Number(f.kg), 0));
  const remainingKg = round3(Math.max(totalKg - filledKg, 0));
  return {
    id: opening.id,
    openedAt: opening.openedAt,
    udhaarKg,
    udhaarValue,
    wastedKg,
    wastedValue,
    totalKg,
    breakEven,
    leftShopKg: Number(opening.leftShopKg),
    filledKg,
    remainingKg,
    remainingValue: round2(remainingKg * breakEven),
  };
}

// New own stock fills the grain's opening Stock Udhaar (after any
// customer's own Stock Udhaar has been given back): as much of the
// batch's shelf grain as is still owed goes to it, counted as sold on
// the batch. Grain-loan batches, waste remainders and batches taken
// out of the grain stock don't fill it.
export async function fillOpeningFromBatch(tx: Tx, productId: string, batchId: string) {
  const state = await getOpeningState(tx, productId);
  if (!state || state.remainingKg <= 0.0005) return;
  const batch = await tx.grainBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (
    batch.ownerCustomerId ||
    batch.removedFromGrain ||
    batch.grainLoanId ||
    batch.grainLoanReturnId ||
    batch.grainWasteId
  ) {
    return;
  }
  const free =
    Number(batch.quantityIn) - Number(batch.quantitySold) - Number(batch.quantityReturned) - Number(batch.quantityAtHome);
  const kg = round3(Math.min(free, state.remainingKg));
  if (kg <= 0.0005) return;
  await tx.grainOpeningFill.create({
    data: { grainOpeningId: state.id, grainBatchId: batchId, kg, rate: Number(batch.rate ?? 0) },
  });
  await tx.grainBatch.update({ where: { id: batchId }, data: { quantitySold: { increment: kg } } });
}

// How much of a batch's "sold" figure went to filling the opening
// Stock Udhaar — so a purchase's delete / edit can tell it apart from
// grain genuinely sold out of it.
export async function openingFilledOnBatch(tx: Tx, batchId: string) {
  const fills = await tx.grainOpeningFill.findMany({ where: { grainBatchId: batchId } });
  return round3(fills.reduce((s, f) => s + Number(f.kg), 0));
}

// Undoes a batch's fills (its purchase is being edited or deleted): the
// grain is back on the batch and the opening Stock Udhaar is owed again.
export async function undoOpeningFills(tx: Tx, batchId: string) {
  const kg = await openingFilledOnBatch(tx, batchId);
  if (kg <= 0) return;
  await tx.grainOpeningFill.deleteMany({ where: { grainBatchId: batchId } });
  await tx.grainBatch.update({ where: { id: batchId }, data: { quantitySold: { decrement: kg } } });
}
