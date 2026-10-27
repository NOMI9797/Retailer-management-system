// Repairs grain purchases recorded before purchases moved the sold
// grain's records: the purchase batch still counts grain that had
// already been sold. Usage: tsx scripts/repair_phantom.ts [--apply]
import { db } from "@/lib/db";
import { coverStockUdhaarFromBatch } from "@/modules/stock/grainFifo";
import { getStockOverview } from "@/modules/stock/actions";
const apply = process.argv.includes("--apply");
class DryRun extends Error {}
(async () => {
  const legacy = await db.stockUdhaarEntry.findMany({
    where: { linkedTransferBatchId: { not: null }, linkedSaleId: null, linkedGrainLoanId: null, linkedGrainLoanReturnId: null },
  });
  const batchIds = [...new Set(legacy.map((e) => e.linkedTransferBatchId!))];
  const products = [...new Set(legacy.map((e) => e.productId))];
  const before = new Map<string, any>();
  for (const pid of products) before.set(pid, await getStockOverview(pid));
  try {
    await db.$transaction(async (tx) => {
      for (const batchId of batchIds) {
        const entries = legacy.filter((e) => e.linkedTransferBatchId === batchId);
        const byDeposit = new Map<string, { e: (typeof entries)[number]; q: number }>();
        for (const e of entries) {
          const cur = byDeposit.get(e.grainBatchId) ?? { e, q: 0 };
          cur.q += Number(e.quantity);
          byDeposit.set(e.grainBatchId, cur);
        }
        for (const { e, q } of byDeposit.values()) {
          if (Math.abs(q) < 0.0001) continue;
          // Only what the purchase batch still holds can be moved back
          // onto it; whatever was sold out of it since stays settled
          // (the customer was paid for it either way).
          const batch = await tx.grainBatch.findUniqueOrThrow({ where: { id: batchId } });
          const free = Number(batch.quantityIn) - Number(batch.quantitySold);
          const redo = Math.round(Math.min(-q, Math.max(free, 0)) * 1000) / 1000;
          if (redo <= 0) continue;
          // Put that much of the paper settlement back, then do it
          // properly (move the sales onto the purchase).
          await tx.stockUdhaarEntry.create({
            data: { customerId: e.customerId, productId: e.productId, grainBatchId: e.grainBatchId, quantity: redo, linkedTransferBatchId: batchId, notes: "Repair: settlement redone with sales moved" },
          });
          await coverStockUdhaarFromBatch(tx, e.productId, batchId, { onlyDepositId: e.grainBatchId, tag: true });
        }
      }
      if (!apply) throw new DryRun();
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  console.log(apply ? "APPLIED" : "DRY RUN (nothing saved)");
  for (const pid of products) {
    const name = (await db.product.findUniqueOrThrow({ where: { id: pid } })).name;
    const b = before.get(pid);
    const a = apply ? await getStockOverview(pid) : null;
    console.log(`${name} now: own ${b.ownAvailable} kg | value Rs ${b.ownValue} | physical ${b.totalPhysical} | Stock Udhaar ${b.stockUdhaarOutstanding}`);
    if (a) console.log(`${name} after: own ${a.ownAvailable} kg | value Rs ${a.ownValue} | physical ${a.totalPhysical} | Stock Udhaar ${a.stockUdhaarOutstanding}`);
  }
  await db.$disconnect();
})();
