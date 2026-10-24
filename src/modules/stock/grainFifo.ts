import type { GrainBatch, Prisma } from "@prisma/client";

// Takes `quantity` of one grain product out of its batches — the shop's
// OWN stock first (oldest batch first), and only once that's used up,
// customers' deposits (oldest first), so Stock Udhaar only ever grows
// when the shop genuinely has no grain of its own left. The one
// implementation behind a sale (applySaleItems) and a
// grain loan (lending out, or the shop giving borrowed grain back).
// Never blocked by stock: whatever the batches can't cover is just
// left untaken (returned as `untaken`). For each batch drawn from it
// bumps quantitySold, calls onTake (the caller records its own
// allocation row there), and — when the batch is a customer's deposit
// not yet bought from them — writes the Stock Udhaar growth entry,
// tagged via stockUdhaarLink so the caller can reverse it exactly.
export async function drawGrainFifo(
  tx: Prisma.TransactionClient,
  params: {
    productId: string;
    quantity: number;
    stockUdhaarLink: Partial<
      Pick<
        Prisma.StockUdhaarEntryUncheckedCreateInput,
        "linkedSaleId" | "visitAt" | "linkedGrainLoanId" | "linkedGrainLoanReturnId"
      >
    >;
    stockUdhaarNote: string;
    beforeTake?: (batch: GrainBatch) => Promise<void>;
    onTake: (batchId: string, quantity: number) => Promise<void>;
  }
): Promise<{ untaken: number }> {
  const all = await tx.grainBatch.findMany({
    where: { productId: params.productId },
    orderBy: { receivedAt: "asc" },
  });
  const batches = [...all.filter((b) => !b.ownerCustomerId), ...all.filter((b) => b.ownerCustomerId)];

  let remaining = params.quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    // A customer batch's quantityTransferred portion has already
    // moved to a NEW shop-owned batch (see stock/actions.ts:
    // createTransferPurchase) and must not be taken again from here —
    // that stock is now that other batch's row to deplete. Always 0
    // for shop-owned batches, so this is a no-op there.
    const available = Number(batch.quantityIn) - Number(batch.quantitySold) - Number(batch.quantityTransferred);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    if (params.beforeTake) await params.beforeTake(batch);
    remaining -= take;

    await tx.grainBatch.update({
      where: { id: batch.id },
      data: { quantitySold: { increment: take } },
    });
    await params.onTake(batch.id, take);

    if (batch.ownerCustomerId) {
      // Taking from a customer's deposited batch BEFORE the shopkeeper
      // has purchased/settled it with them (see Stock Management spec,
      // "Stock Udhaar"). This must NOT reduce the customer's ownership
      // claim (that's quantityTransferred, untouched here — only
      // quantitySold, the physical count, moved above) and must NOT
      // auto-pay them — payment only happens later via an explicit
      // transfer-purchase. Instead this grows a tracked, auditable
      // shortfall the shopkeeper still owes the customer in STOCK.
      await tx.stockUdhaarEntry.create({
        data: {
          customerId: batch.ownerCustomerId,
          productId: params.productId,
          grainBatchId: batch.id,
          quantity: take,
          notes: params.stockUdhaarNote,
          ...params.stockUdhaarLink,
        },
      });
    }
  }

  return { untaken: Math.max(remaining, 0) };
}

// Shop-owned grain just came in (a purchase): before it counts as the
// shop's own stock, it first gives back grain the shop owes depositors
// — Stock Udhaar, oldest first. Physically, the new grain refills the
// deposits that were sold from. In the records, the earlier sales /
// loan draws that took a depositor's grain are moved onto this new
// batch for the covered quantity (so their cost is now this
// purchase's rate), the deposit's quantitySold drops back by that much
// (its grain is on the shelf again), and a compensating Stock Udhaar
// entry carrying the same sale / loan link cancels the shortfall — so
// reversing that sale or loan later still nets to exactly zero.
export async function coverStockUdhaarFromBatch(tx: Prisma.TransactionClient, productId: string, newBatchId: string) {
  const newBatch = await tx.grainBatch.findUniqueOrThrow({ where: { id: newBatchId } });
  let free = Number(newBatch.quantityIn) - Number(newBatch.quantitySold);
  if (free <= 0.0001 || newBatch.ownerCustomerId) return;

  const entries = await tx.stockUdhaarEntry.findMany({ where: { productId } });
  const owed = new Map<string, number>();
  for (const e of entries) owed.set(e.grainBatchId, (owed.get(e.grainBatchId) ?? 0) + Number(e.quantity));
  const batchIds = [...owed].filter(([, q]) => q > 0.0001).map(([id]) => id);
  if (batchIds.length === 0) return;

  const deposits = new Map(
    (await tx.grainBatch.findMany({ where: { id: { in: batchIds }, ownerCustomerId: { not: null } } })).map((b) => [b.id, b])
  );
  const saleAllocs = await tx.dailySaleItemBatch.findMany({
    where: { grainBatchId: { in: [...deposits.keys()] } },
    include: { dailySaleItem: true },
  });
  const loanDraws = await tx.grainLoanDraw.findMany({
    where: { grainBatchId: { in: [...deposits.keys()] } },
    include: { grainLoan: true, grainLoanReturn: true },
  });
  const takes = [
    ...saleAllocs.map((a) => ({ kind: "SALE" as const, row: a, at: a.dailySaleItem.visitAt })),
    ...loanDraws.map((d) => ({
      kind: "LOAN" as const,
      row: d,
      at: d.grainLoan?.loanDate ?? d.grainLoanReturn?.returnDate ?? new Date(0),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const take of takes) {
    if (free <= 0.0001) break;
    const deposit = deposits.get(take.row.grainBatchId)!;
    const stillOwed = owed.get(deposit.id) ?? 0;
    if (stillOwed <= 0.0001) continue;
    const q = Math.round(Math.min(Number(take.row.quantity), stillOwed, free) * 1000) / 1000;
    if (q <= 0) continue;

    // Move q of this draw from the deposit onto the new batch.
    if (take.kind === "SALE") {
      await tx.dailySaleItemBatch.update({ where: { id: take.row.id }, data: { quantity: { decrement: q } } });
      await tx.dailySaleItemBatch.create({
        data: { dailySaleItemId: take.row.dailySaleItemId, grainBatchId: newBatchId, quantity: q },
      });
    } else {
      await tx.grainLoanDraw.update({ where: { id: take.row.id }, data: { quantity: { decrement: q } } });
      await tx.grainLoanDraw.create({
        data: {
          grainBatchId: newBatchId,
          quantity: q,
          grainLoanId: take.row.grainLoanId,
          grainLoanReturnId: take.row.grainLoanReturnId,
        },
      });
    }
    await tx.grainBatch.update({ where: { id: deposit.id }, data: { quantitySold: { decrement: q } } });
    await tx.grainBatch.update({ where: { id: newBatchId }, data: { quantitySold: { increment: q } } });

    const link =
      take.kind === "SALE"
        ? { linkedSaleId: take.row.dailySaleItem.dailySaleId, visitAt: take.row.dailySaleItem.visitAt }
        : take.row.grainLoanId
          ? { linkedGrainLoanId: take.row.grainLoanId }
          : { linkedGrainLoanReturnId: take.row.grainLoanReturnId };
    await tx.stockUdhaarEntry.create({
      data: {
        customerId: deposit.ownerCustomerId!,
        productId,
        grainBatchId: deposit.id,
        quantity: -q,
        notes: "Given back from new stock",
        ...link,
      },
    });

    owed.set(deposit.id, stillOwed - q);
    free -= q;
  }
  // Clean up allocation rows emptied by the moves.
  await tx.dailySaleItemBatch.deleteMany({ where: { grainBatchId: { in: [...deposits.keys()] }, quantity: { lte: 0 } } });
  await tx.grainLoanDraw.deleteMany({ where: { grainBatchId: { in: [...deposits.keys()] }, quantity: { lte: 0 } } });
}
