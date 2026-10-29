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
    where: { productId: params.productId, removedFromGrain: false },
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
    // Grain given back to a depositor unsettled (quantityReturned) has
    // left the shop too; grain bought but still at a customer's home
    // (quantityAtHome) isn't on the shelf yet.
    const available =
      Number(batch.quantityIn) -
      Number(batch.quantitySold) -
      Number(batch.quantityTransferred) -
      Number(batch.quantityReturned) -
      Number(batch.quantityAtHome);
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
//
// Buying a customer's grain uses this too (options): onlyDepositId
// limits it to the deposit being bought (its already-sold part is what
// the shop is paying for first), and `tag` marks each compensating
// entry with the purchase's batch (linkedTransferBatchId) so deleting
// or editing that purchase can move it all back (undoCoverOntoBatch).
export async function coverStockUdhaarFromBatch(
  tx: Prisma.TransactionClient,
  productId: string,
  newBatchId: string,
  options?: { onlyDepositId?: string; tag?: boolean }
) {
  const newBatch = await tx.grainBatch.findUniqueOrThrow({ where: { id: newBatchId } });
  // Only grain on the shelf can refill a deposit — what's still at a
  // customer's home waits until it's picked up.
  let free =
    Number(newBatch.quantityIn) -
    Number(newBatch.quantitySold) -
    Number(newBatch.quantityReturned) -
    Number(newBatch.quantityAtHome);
  if (free <= 0.0001 || newBatch.ownerCustomerId) return;

  const entries = await tx.stockUdhaarEntry.findMany({
    where: { productId, grainBatchId: options?.onlyDepositId || undefined },
  });
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
        notes: options?.tag ? "Bought by the shop" : "Given back from new stock",
        ...link,
        ...(options?.tag ? { linkedTransferBatchId: newBatchId } : {}),
      },
    });

    owed.set(deposit.id, stillOwed - q);
    free -= q;
  }
  // Clean up allocation rows emptied by the moves.
  await tx.dailySaleItemBatch.deleteMany({ where: { grainBatchId: { in: [...deposits.keys()] }, quantity: { lte: 0 } } });
  await tx.grainLoanDraw.deleteMany({ where: { grainBatchId: { in: [...deposits.keys()] }, quantity: { lte: 0 } } });
}

// Before a depositor takes back grain the shop had already sold from
// their deposit (Stock Udhaar), the shop puts that much back from its
// OWN stock: the sales / loan draws that took it are moved off the
// deposit onto the shop's own batches (oldest first), the deposit's
// quantitySold drops back, and a compensating Stock Udhaar entry with
// the same sale / loan link cancels the shortfall — the same moves as
// coverStockUdhaarFromBatch, from existing own stock instead of a new
// purchase. The caller checks there's enough own stock first; returns
// how much was covered.
export async function coverDepositFromOwnStock(
  tx: Prisma.TransactionClient,
  params: { productId: string; depositId: string; quantity: number }
): Promise<number> {
  const deposit = await tx.grainBatch.findUniqueOrThrow({ where: { id: params.depositId } });
  const owedEntries = await tx.stockUdhaarEntry.findMany({ where: { grainBatchId: deposit.id } });
  let owed = owedEntries.reduce((s, e) => s + Number(e.quantity), 0);

  const ownBatches = (
    await tx.grainBatch.findMany({
      where: { productId: params.productId, ownerCustomerId: null, removedFromGrain: false },
      orderBy: { receivedAt: "asc" },
    })
  ).map((b) => ({
    id: b.id,
    free: Number(b.quantityIn) - Number(b.quantitySold) - Number(b.quantityReturned) - Number(b.quantityAtHome),
  }));

  const saleAllocs = await tx.dailySaleItemBatch.findMany({
    where: { grainBatchId: deposit.id },
    include: { dailySaleItem: true },
  });
  const loanDraws = await tx.grainLoanDraw.findMany({
    where: { grainBatchId: deposit.id },
    include: { grainLoan: true, grainLoanReturn: true },
  });
  const takes = [
    ...saleAllocs.map((a) => ({ kind: "SALE" as const, row: a, left: Number(a.quantity), at: a.dailySaleItem.visitAt })),
    ...loanDraws.map((d) => ({
      kind: "LOAN" as const,
      row: d,
      left: Number(d.quantity),
      at: d.grainLoan?.loanDate ?? d.grainLoanReturn?.returnDate ?? new Date(0),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  let needed = params.quantity;
  for (const take of takes) {
    for (const own of ownBatches) {
      if (needed <= 0.0001 || owed <= 0.0001 || take.left <= 0.0001) break;
      if (own.free <= 0.0001) continue;
      const q = Math.round(Math.min(take.left, own.free, needed, owed) * 1000) / 1000;
      if (q <= 0) continue;

      if (take.kind === "SALE") {
        await tx.dailySaleItemBatch.update({ where: { id: take.row.id }, data: { quantity: { decrement: q } } });
        await tx.dailySaleItemBatch.create({
          data: { dailySaleItemId: take.row.dailySaleItemId, grainBatchId: own.id, quantity: q },
        });
      } else {
        await tx.grainLoanDraw.update({ where: { id: take.row.id }, data: { quantity: { decrement: q } } });
        await tx.grainLoanDraw.create({
          data: {
            grainBatchId: own.id,
            quantity: q,
            grainLoanId: take.row.grainLoanId,
            grainLoanReturnId: take.row.grainLoanReturnId,
          },
        });
      }
      await tx.grainBatch.update({ where: { id: deposit.id }, data: { quantitySold: { decrement: q } } });
      await tx.grainBatch.update({ where: { id: own.id }, data: { quantitySold: { increment: q } } });

      const link =
        take.kind === "SALE"
          ? { linkedSaleId: take.row.dailySaleItem.dailySaleId, visitAt: take.row.dailySaleItem.visitAt }
          : take.row.grainLoanId
            ? { linkedGrainLoanId: take.row.grainLoanId }
            : { linkedGrainLoanReturnId: take.row.grainLoanReturnId };
      await tx.stockUdhaarEntry.create({
        data: {
          customerId: deposit.ownerCustomerId!,
          productId: params.productId,
          grainBatchId: deposit.id,
          quantity: -q,
          notes: "Given back from shop's own stock",
          ...link,
        },
      });

      take.left -= q;
      own.free -= q;
      owed -= q;
      needed -= q;
    }
  }
  await tx.dailySaleItemBatch.deleteMany({ where: { grainBatchId: deposit.id, quantity: { lte: 0 } } });
  await tx.grainLoanDraw.deleteMany({ where: { grainBatchId: deposit.id, quantity: { lte: 0 } } });
  return Math.round((params.quantity - needed) * 1000) / 1000;
}

// What a purchase batch still carries from coverStockUdhaarFromBatch
// (tagged entries): per deposit and sale / loan, how much of that
// deposit's sold grain was moved onto the batch. Net of any earlier
// undo, so it's always what's there now.
async function taggedMoves(tx: Prisma.TransactionClient, batchId: string) {
  const tagged = await tx.stockUdhaarEntry.findMany({
    where: {
      linkedTransferBatchId: batchId,
      OR: [{ linkedSaleId: { not: null } }, { linkedGrainLoanId: { not: null } }, { linkedGrainLoanReturnId: { not: null } }],
    },
  });
  const net = new Map<string, { entry: (typeof tagged)[number]; moved: number }>();
  for (const e of tagged) {
    const key = [e.grainBatchId, e.linkedSaleId, e.visitAt?.getTime(), e.linkedGrainLoanId, e.linkedGrainLoanReturnId].join(":");
    const cur = net.get(key) ?? { entry: e, moved: 0 };
    cur.moved -= Number(e.quantity);
    net.set(key, cur);
  }
  return [...net.values()].filter((m) => m.moved > 0.0001);
}

// How much of a purchase batch's "sold" figure is really grain it took
// over from a deposit (not sold from it since) — so delete / edit can
// tell that apart from grain genuinely sold out of the purchase.
export async function movedOntoBatch(tx: Prisma.TransactionClient, batchId: string) {
  return Math.round((await taggedMoves(tx, batchId)).reduce((s, m) => s + m.moved, 0) * 1000) / 1000;
}

// Undoes coverStockUdhaarFromBatch(..., { tag: true }) for a purchase
// being deleted or edited: each sale / loan draw moved onto the batch
// goes back onto its deposit, the deposit is "sold" again, and the
// Stock Udhaar comes back with the same link — so the customer is owed
// that grain again, exactly as before the purchase. A draw that no
// longer exists (its sale was since deleted) has nothing to move back.
export async function undoCoverOntoBatch(tx: Prisma.TransactionClient, batchId: string) {
  for (const { entry, moved } of await taggedMoves(tx, batchId)) {
    let left = moved;
    if (entry.linkedSaleId) {
      const allocs = await tx.dailySaleItemBatch.findMany({
        where: {
          grainBatchId: batchId,
          dailySaleItem: {
            dailySaleId: entry.linkedSaleId,
            ...(entry.visitAt ? { visitAt: entry.visitAt } : {}),
          },
        },
      });
      for (const a of allocs) {
        if (left <= 0.0001) break;
        const q = Math.round(Math.min(Number(a.quantity), left) * 1000) / 1000;
        await tx.dailySaleItemBatch.update({ where: { id: a.id }, data: { quantity: { decrement: q } } });
        await tx.dailySaleItemBatch.create({
          data: { dailySaleItemId: a.dailySaleItemId, grainBatchId: entry.grainBatchId, quantity: q },
        });
        left -= q;
      }
    } else {
      const draws = await tx.grainLoanDraw.findMany({
        where: {
          grainBatchId: batchId,
          grainLoanId: entry.linkedGrainLoanId ?? undefined,
          grainLoanReturnId: entry.linkedGrainLoanReturnId ?? undefined,
        },
      });
      for (const d of draws) {
        if (left <= 0.0001) break;
        const q = Math.round(Math.min(Number(d.quantity), left) * 1000) / 1000;
        await tx.grainLoanDraw.update({ where: { id: d.id }, data: { quantity: { decrement: q } } });
        await tx.grainLoanDraw.create({
          data: { grainBatchId: entry.grainBatchId, quantity: q, grainLoanId: d.grainLoanId, grainLoanReturnId: d.grainLoanReturnId },
        });
        left -= q;
      }
    }
    const back = Math.round((moved - left) * 1000) / 1000;
    if (back > 0) {
      await tx.grainBatch.update({ where: { id: batchId }, data: { quantitySold: { decrement: back } } });
      await tx.grainBatch.update({ where: { id: entry.grainBatchId }, data: { quantitySold: { increment: back } } });
    }
    // Close this move out (tagged, so it nets to zero for taggedMoves);
    // the customer is owed the moved-back grain again.
    await tx.stockUdhaarEntry.create({
      data: {
        customerId: entry.customerId,
        productId: entry.productId,
        grainBatchId: entry.grainBatchId,
        quantity: moved,
        linkedSaleId: entry.linkedSaleId,
        visitAt: entry.visitAt,
        linkedGrainLoanId: entry.linkedGrainLoanId,
        linkedGrainLoanReturnId: entry.linkedGrainLoanReturnId,
        linkedTransferBatchId: batchId,
        notes: "Purchase undone — owed again",
      },
    });
    // A draw that's gone (its sale deleted) leaves nothing owed.
    if (left > 0.0001) {
      await tx.stockUdhaarEntry.create({
        data: {
          customerId: entry.customerId,
          productId: entry.productId,
          grainBatchId: entry.grainBatchId,
          quantity: -Math.round(left * 1000) / 1000,
          linkedSaleId: entry.linkedSaleId,
          visitAt: entry.visitAt,
          linkedGrainLoanId: entry.linkedGrainLoanId,
          linkedGrainLoanReturnId: entry.linkedGrainLoanReturnId,
          notes: "Purchase undone — sale no longer there",
        },
      });
    }
  }
  await tx.dailySaleItemBatch.deleteMany({ where: { grainBatchId: batchId, quantity: { lte: 0 } } });
  await tx.grainLoanDraw.deleteMany({ where: { grainBatchId: batchId, quantity: { lte: 0 } } });
}

// What grain lent out cost the shop, per kg, for each loan: the
// batches it was taken from at their rates (a deposit's grain, still
// unpriced, falls back to the loan's agreed rate). Lent grain is the
// shop's stock while it's out, so it's valued — and comes back into
// stock — at this, not at the agreed rate.
export async function lentCostRates(
  tx: Prisma.TransactionClient,
  loans: { id: string; rate: Prisma.Decimal | number }[]
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  if (loans.length === 0) return rates;
  const draws = await tx.grainLoanDraw.findMany({
    where: { grainLoanId: { in: loans.map((l) => l.id) } },
    select: { grainLoanId: true, quantity: true, grainBatch: { select: { rate: true } } },
  });
  for (const loan of loans) {
    const agreed = Number(loan.rate);
    let kg = 0;
    let cost = 0;
    for (const d of draws) {
      if (d.grainLoanId !== loan.id) continue;
      const q = Number(d.quantity);
      kg += q;
      cost += q * (d.grainBatch.rate !== null ? Number(d.grainBatch.rate) : agreed);
    }
    rates.set(loan.id, kg > 0.0001 ? Math.round((cost / kg) * 100) / 100 : agreed);
  }
  return rates;
}
