"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { parseLocalDateStart, toLocalDateString } from "@/lib/utils";
import { postToBankAccount } from "@/modules/settings/bankAccounts.actions";
import { postToPooledGrainStock } from "@/modules/stock/actions";
import { drawGrainFifo } from "@/modules/stock/grainFifo";
import {
  grainLoanSchema,
  updateGrainLoanSchema,
  grainLoanReturnSchema,
  updateGrainLoanReturnSchema,
  type GrainLoanInput,
  type UpdateGrainLoanInput,
  type GrainLoanReturnInput,
  type UpdateGrainLoanReturnInput,
} from "./schema";
import type {
  GrainBatch,
  GrainLoan,
  GrainLoanReturn,
  Prisma,
} from "@prisma/client";

// Grain loans — grain lent to / borrowed from a customer or dealer and
// given back later as the same grain (see GrainLoan's schema comment).
// Only QUANTITY moves: never a sale, never P&L, never pooled stock
// value. Money appears only when a return settles some of the grain in
// money instead (the amount actually paid, at that day's rate — never
// derived from the loan's rate), as real Cash/Account in or out.
//
//   SHOP_LENT      loan:   grain out of stock, oldest batch first (drawGrainFifo)
//                  return: grain back in as a new shop-owned batch; money IN
//   SHOP_BORROWED  loan:   grain in as a new shop-owned batch
//                  return: grain out of stock (drawGrainFifo); money OUT
//
// Every edit is reverse-then-reapply inside one transaction, except a
// batch the loan event created: once it has been sold from it's edited
// in place (quantityIn can't drop below what's sold), since that
// grain's sales point at it.

// A user-facing business-rule failure raised inside a transaction, so
// it rolls everything back and still reaches the form as a message.
class LoanError extends Error {}

function isUserFacing(err: unknown): err is Error {
  return (
    err instanceof LoanError ||
    (err instanceof Error && err.message.startsWith("Not enough balance"))
  );
}

async function runLoanTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return ok(await db.$transaction(fn));
  } catch (err) {
    if (isUserFacing(err)) return fail(err.message);
    throw err;
  }
}

// Today keeps the current time (so FIFO order among today's batches
// stays true); a past date is that day's start.
function eventDate(dateStr?: string) {
  if (!dateStr || dateStr === toLocalDateString(new Date())) return new Date();
  return parseLocalDateStart(dateStr);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function resolveLoanTargets(
  shopId: string,
  data: { productId: string; customerId?: string; dealerId?: string },
): Promise<ActionResult<{ productName: string }>> {
  const product = await db.product.findFirst({
    where: { id: data.productId, shopId, stockKind: "GRAIN" },
  });
  if (!product) return fail("Grain product not found");
  if (data.customerId) {
    const customer = await db.customer.findFirst({
      where: { id: data.customerId, shopId },
    });
    if (!customer) return fail("Customer not found");
  }
  if (data.dealerId) {
    const dealer = await db.dealer.findFirst({
      where: { id: data.dealerId, shopId, isDeleted: false },
    });
    if (!dealer) return fail("Dealer not found");
  }
  return ok({ productName: product.name });
}

// ── Stock helpers (all inside the caller's transaction) ──

type DrawOwner = { grainLoanId: string } | { grainLoanReturnId: string };

// Takes grain out of stock for a loan event, recording each batch drawn.
async function drawForLoan(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
  owner: DrawOwner,
  note: string,
) {
  const link =
    "grainLoanId" in owner
      ? { linkedGrainLoanId: owner.grainLoanId }
      : { linkedGrainLoanReturnId: owner.grainLoanReturnId };
  await drawGrainFifo(tx, {
    productId,
    quantity,
    stockUdhaarLink: link,
    stockUdhaarNote: note,
    onTake: async (grainBatchId, taken) => {
      await tx.grainLoanDraw.create({
        data: { grainBatchId, quantity: taken, ...owner },
      });
    },
  });
  await postToPooledGrainStock(tx, productId, -quantity, 0);
}

// Puts back exactly what drawForLoan took, and cancels its Stock
// Udhaar with compensating entries (never deletes — same append-only
// rule as reverseSaleContents). Compensates the NET per batch, so it
// stays right however many times the event has been edited.
async function undoDraw(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
  owner: DrawOwner,
) {
  const draws = await tx.grainLoanDraw.findMany({ where: owner });
  for (const draw of draws) {
    await tx.grainBatch.update({
      where: { id: draw.grainBatchId },
      data: { quantitySold: { decrement: draw.quantity } },
    });
  }
  await tx.grainLoanDraw.deleteMany({ where: owner });

  const link =
    "grainLoanId" in owner
      ? { linkedGrainLoanId: owner.grainLoanId }
      : { linkedGrainLoanReturnId: owner.grainLoanReturnId };
  const entries = await tx.stockUdhaarEntry.findMany({ where: link });
  const net = new Map<
    string,
    {
      customerId: string;
      productId: string;
      grainBatchId: string;
      quantity: number;
    }
  >();
  for (const e of entries) {
    const key = `${e.customerId}:${e.grainBatchId}`;
    const cur = net.get(key) ?? {
      customerId: e.customerId,
      productId: e.productId,
      grainBatchId: e.grainBatchId,
      quantity: 0,
    };
    cur.quantity += Number(e.quantity);
    net.set(key, cur);
  }
  for (const e of net.values()) {
    if (e.quantity <= 0.0001) continue;
    await tx.stockUdhaarEntry.create({
      data: {
        ...e,
        quantity: -round3(e.quantity),
        ...link,
        notes: "Reversed — grain loan edited/deleted",
      },
    });
  }

  await postToPooledGrainStock(tx, productId, quantity, 0);
}

type BatchOwner = { grainLoanId: string } | { grainLoanReturnId: string };

// Brings the batch a loan event put grain into to `quantity` (0 = no
// batch). Created, edited in place, or removed — never reduced below
// what has already been sold from it.
async function syncCreatedBatch(
  tx: Prisma.TransactionClient,
  params: {
    productId: string;
    owner: BatchOwner;
    quantity: number;
    rate: number;
    receivedAt: Date;
    unitName: string;
  },
) {
  const existing: GrainBatch | null = await tx.grainBatch.findFirst({
    where: params.owner,
  });
  const oldQty = existing ? Number(existing.quantityIn) : 0;

  if (existing) {
    const sold = Number(existing.quantitySold);
    if (params.quantity < sold - 0.0001) {
      throw new LoanError(
        `${sold} ${params.unitName} of this grain has already been sold — the quantity can't go below that.`,
      );
    }
    if (params.quantity <= 0) {
      await tx.grainBatch.delete({ where: { id: existing.id } });
    } else {
      await tx.grainBatch.update({
        where: { id: existing.id },
        data: {
          quantityIn: params.quantity,
          rate: params.rate,
          receivedAt: params.receivedAt,
        },
      });
    }
  } else if (params.quantity > 0) {
    await tx.grainBatch.create({
      data: {
        productId: params.productId,
        quantityIn: params.quantity,
        rate: params.rate,
        receivedAt: params.receivedAt,
        ...params.owner,
      },
    });
  }

  if (Math.abs(params.quantity - oldQty) > 0.0001) {
    await postToPooledGrainStock(
      tx,
      params.productId,
      params.quantity - oldQty,
      0,
    );
  }
}

// Money paid instead of returning bags: into the bank for grain the
// shop lent (the party pays the shop), out of it for grain the shop
// borrowed. Cash needs no posting — Cash Flow reads the return rows.
async function postReturnMoney(
  tx: Prisma.TransactionClient,
  direction: GrainLoan["direction"],
  ret: Pick<GrainLoanReturn, "paymentMethod" | "bankAccountId" | "amount">,
  sign: 1 | -1,
) {
  if (ret.paymentMethod !== "ACCOUNT" || !ret.bankAccountId) return;
  const amount = Number(ret.amount);
  if (amount <= 0) return;
  const delta = (direction === "SHOP_LENT" ? amount : -amount) * sign;
  await postToBankAccount(tx, ret.bankAccountId, delta);
}

async function applyLoanStock(
  tx: Prisma.TransactionClient,
  loan: GrainLoan,
  productName: string,
  unitName: string,
) {
  if (loan.direction === "SHOP_LENT") {
    await drawForLoan(
      tx,
      loan.productId,
      Number(loan.quantity),
      { grainLoanId: loan.id },
      `${productName} lent out from deposit`,
    );
  } else {
    await syncCreatedBatch(tx, {
      productId: loan.productId,
      owner: { grainLoanId: loan.id },
      quantity: Number(loan.quantity),
      rate: Number(loan.rate),
      receivedAt: loan.loanDate,
      unitName,
    });
  }
}

async function applyReturnStock(
  tx: Prisma.TransactionClient,
  loan: GrainLoan,
  ret: GrainLoanReturn,
  productName: string,
  unitName: string,
) {
  const qty = Number(ret.quantityReturned);
  if (loan.direction === "SHOP_LENT") {
    await syncCreatedBatch(tx, {
      productId: loan.productId,
      owner: { grainLoanReturnId: ret.id },
      quantity: qty,
      rate: Number(loan.rate),
      receivedAt: ret.returnDate,
      unitName,
    });
  } else if (qty > 0) {
    await drawForLoan(
      tx,
      loan.productId,
      qty,
      { grainLoanReturnId: ret.id },
      `${productName} given back from deposit`,
    );
  }
}

async function undoReturnStock(
  tx: Prisma.TransactionClient,
  loan: GrainLoan,
  ret: GrainLoanReturn,
) {
  if (loan.direction === "SHOP_BORROWED" && Number(ret.quantityReturned) > 0) {
    await undoDraw(tx, loan.productId, Number(ret.quantityReturned), {
      grainLoanReturnId: ret.id,
    });
  }
  // SHOP_LENT's created batch is synced (or removed) by the caller.
}

async function settledSoFar(
  tx: Prisma.TransactionClient,
  grainLoanId: string,
  excludeReturnId?: string,
) {
  const returns = await tx.grainLoanReturn.findMany({
    where: {
      grainLoanId,
      ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}),
    },
  });
  return returns.reduce(
    (sum, r) => sum + Number(r.quantityReturned) + Number(r.quantityPaid),
    0,
  );
}

// ── Loans ──

export async function createGrainLoan(
  input: GrainLoanInput,
): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const parsed = grainLoanSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const data = parsed.data;

  const target = await resolveLoanTargets(shopId, data);
  if (!target.success) return target;
  const product = await db.product.findFirstOrThrow({
    where: { id: data.productId },
    include: { unit: true },
  });

  return runLoanTx(async (tx) => {
    const loan = await tx.grainLoan.create({
      data: {
        shopId,
        productId: data.productId,
        customerId: data.customerId ?? null,
        dealerId: data.dealerId ?? null,
        direction: data.direction,
        quantity: data.quantity,
        rate: data.rate,
        loanDate: eventDate(data.loanDate),
        reference: data.reference,
        notes: data.notes || null,
      },
    });
    await applyLoanStock(tx, loan, product.name, product.unit.name);
    return { id: loan.id };
  });
}

export async function updateGrainLoan(
  input: UpdateGrainLoanInput,
): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const parsed = updateGrainLoanSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const data = parsed.data;

  const loan = await db.grainLoan.findFirst({
    where: { id: data.id, shopId },
    include: { returns: true },
  });
  if (!loan) return fail("Grain loan not found");

  const target = await resolveLoanTargets(shopId, data);
  if (!target.success) return target;
  const product = await db.product.findFirstOrThrow({
    where: { id: data.productId },
    include: { unit: true },
  });

  if (loan.returns.length > 0) {
    if (
      data.direction !== loan.direction ||
      data.productId !== loan.productId
    ) {
      return fail(
        "This loan already has returns — delete them first to change the grain or the direction.",
      );
    }
    const settled = loan.returns.reduce(
      (s, r) => s + Number(r.quantityReturned) + Number(r.quantityPaid),
      0,
    );
    if (data.quantity < settled - 0.0001) {
      return fail(
        `${round3(settled)} ${product.unit.name} has already been given back — the quantity can't go below that.`,
      );
    }
  }

  // The new date is kept if the day didn't change, so editing other
  // fields doesn't move the batch in FIFO order.
  const loanDate =
    data.loanDate && data.loanDate !== toLocalDateString(loan.loanDate)
      ? eventDate(data.loanDate)
      : loan.loanDate;

  return runLoanTx(async (tx) => {
    // Undo the old stock movement.
    if (loan.direction === "SHOP_LENT") {
      await undoDraw(tx, loan.productId, Number(loan.quantity), {
        grainLoanId: loan.id,
      });
    } else if (
      data.direction !== "SHOP_BORROWED" ||
      data.productId !== loan.productId
    ) {
      await syncCreatedBatch(tx, {
        productId: loan.productId,
        owner: { grainLoanId: loan.id },
        quantity: 0,
        rate: Number(loan.rate),
        receivedAt: loan.loanDate,
        unitName: product.unit.name,
      });
    }

    const updated = await tx.grainLoan.update({
      where: { id: loan.id },
      data: {
        productId: data.productId,
        customerId: data.customerId ?? null,
        dealerId: data.dealerId ?? null,
        direction: data.direction,
        quantity: data.quantity,
        rate: data.rate,
        loanDate,
        reference: data.reference,
        notes: data.notes || null,
      },
    });
    // SHOP_BORROWED → its batch is synced in place (kept if sold from).
    await applyLoanStock(tx, updated, product.name, product.unit.name);

    // Grain given back to the shop is costed at the loan's rate.
    if (updated.direction === "SHOP_LENT") {
      await tx.grainBatch.updateMany({
        where: { grainLoanReturnId: { in: loan.returns.map((r) => r.id) } },
        data: { rate: data.rate },
      });
    }
    return { id: updated.id };
  });
}

export async function deleteGrainLoan(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const loan = await db.grainLoan.findFirst({
    where: { id, shopId },
    include: { returns: true, product: { include: { unit: true } } },
  });
  if (!loan) return fail("Grain loan not found");
  if (loan.returns.length > 0) return fail("Delete this loan's returns first.");
  const batch = await db.grainBatch.findFirst({
    where: { grainLoanId: loan.id },
  });
  if (batch && Number(batch.quantitySold) > 0) {
    return fail(
      `${Number(batch.quantitySold)} ${loan.product.unit.name} of this borrowed grain has already been sold, so the loan can't be deleted — edit it instead.`,
    );
  }

  return runLoanTx(async (tx) => {
    if (loan.direction === "SHOP_LENT") {
      await undoDraw(tx, loan.productId, Number(loan.quantity), {
        grainLoanId: loan.id,
      });
    } else {
      await syncCreatedBatch(tx, {
        productId: loan.productId,
        owner: { grainLoanId: loan.id },
        quantity: 0,
        rate: Number(loan.rate),
        receivedAt: loan.loanDate,
        unitName: loan.product.unit.name,
      });
    }
    await tx.grainLoan.delete({ where: { id: loan.id } });
    return { id: loan.id };
  });
}

// ── Returns ──

export async function recordGrainLoanReturn(
  input: GrainLoanReturnInput,
): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const parsed = grainLoanReturnSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const data = parsed.data;

  const loan = await db.grainLoan.findFirst({
    where: { id: data.grainLoanId, shopId },
    include: { product: { include: { unit: true } } },
  });
  if (!loan) return fail("Grain loan not found");
  if (
    data.bankAccountId &&
    !(await db.bankAccount.findFirst({
      where: { id: data.bankAccountId, shopId },
    }))
  ) {
    return fail("Bank account not found");
  }

  return runLoanTx(async (tx) => {
    const outstanding =
      Number(loan.quantity) - (await settledSoFar(tx, loan.id));
    if (data.quantityReturned + data.quantityPaid > outstanding + 0.0001) {
      throw new LoanError(
        `Only ${round3(outstanding)} ${loan.product.unit.name} is still owed on this loan.`,
      );
    }
    const ret = await tx.grainLoanReturn.create({
      data: {
        shopId,
        grainLoanId: loan.id,
        quantityReturned: data.quantityReturned,
        quantityPaid: data.quantityPaid,
        amount: data.quantityPaid > 0 ? round2(data.amount) : 0,
        paymentMethod: data.quantityPaid > 0 ? data.paymentMethod : null,
        bankAccountId:
          data.quantityPaid > 0 && data.paymentMethod === "ACCOUNT"
            ? data.bankAccountId
            : null,
        returnDate: eventDate(data.returnDate),
        reference: data.reference,
      },
    });
    await applyReturnStock(
      tx,
      loan,
      ret,
      loan.product.name,
      loan.product.unit.name,
    );
    await postReturnMoney(tx, loan.direction, ret, 1);
    return { id: ret.id };
  });
}

export async function updateGrainLoanReturn(
  input: UpdateGrainLoanReturnInput,
): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const parsed = updateGrainLoanReturnSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const data = parsed.data;

  const ret = await db.grainLoanReturn.findFirst({
    where: { id: data.id, shopId },
    include: {
      grainLoan: { include: { product: { include: { unit: true } } } },
    },
  });
  if (!ret) return fail("Return not found");
  const loan = ret.grainLoan;
  if (
    data.bankAccountId &&
    !(await db.bankAccount.findFirst({
      where: { id: data.bankAccountId, shopId },
    }))
  ) {
    return fail("Bank account not found");
  }

  const returnDate =
    data.returnDate && data.returnDate !== toLocalDateString(ret.returnDate)
      ? eventDate(data.returnDate)
      : ret.returnDate;

  return runLoanTx(async (tx) => {
    const outstanding =
      Number(loan.quantity) - (await settledSoFar(tx, loan.id, ret.id));
    if (data.quantityReturned + data.quantityPaid > outstanding + 0.0001) {
      throw new LoanError(
        `Only ${round3(outstanding)} ${loan.product.unit.name} is owed on this loan.`,
      );
    }

    await undoReturnStock(tx, loan, ret);
    await postReturnMoney(tx, loan.direction, ret, -1);

    const updated = await tx.grainLoanReturn.update({
      where: { id: ret.id },
      data: {
        quantityReturned: data.quantityReturned,
        quantityPaid: data.quantityPaid,
        amount: data.quantityPaid > 0 ? round2(data.amount) : 0,
        paymentMethod: data.quantityPaid > 0 ? data.paymentMethod : null,
        bankAccountId:
          data.quantityPaid > 0 && data.paymentMethod === "ACCOUNT"
            ? data.bankAccountId
            : null,
        returnDate,
        reference: data.reference,
      },
    });
    await applyReturnStock(
      tx,
      loan,
      updated,
      loan.product.name,
      loan.product.unit.name,
    );
    await postReturnMoney(tx, loan.direction, updated, 1);
    return { id: updated.id };
  });
}

export async function deleteGrainLoanReturn(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const shopId = await getCurrentShopId();
  const ret = await db.grainLoanReturn.findFirst({
    where: { id, shopId },
    include: {
      grainLoan: { include: { product: { include: { unit: true } } } },
    },
  });
  if (!ret) return fail("Return not found");
  const loan = ret.grainLoan;
  const batch = await db.grainBatch.findFirst({
    where: { grainLoanReturnId: ret.id },
  });
  if (batch && Number(batch.quantitySold) > 0) {
    return fail(
      `${Number(batch.quantitySold)} ${loan.product.unit.name} of the returned grain has already been sold, so this return can't be deleted — edit it instead.`,
    );
  }

  return runLoanTx(async (tx) => {
    await undoReturnStock(tx, loan, ret);
    if (loan.direction === "SHOP_LENT") {
      await syncCreatedBatch(tx, {
        productId: loan.productId,
        owner: { grainLoanReturnId: ret.id },
        quantity: 0,
        rate: Number(loan.rate),
        receivedAt: ret.returnDate,
        unitName: loan.product.unit.name,
      });
    }
    await postReturnMoney(tx, loan.direction, ret, -1);
    await tx.grainLoanReturn.delete({ where: { id: ret.id } });
    return { id: ret.id };
  });
}

// ── Reads ──

export type GrainLoanRow = Awaited<ReturnType<typeof listGrainLoans>>[number];

// Loans with what's been given back and what's still owed, newest
// first. Filter by grain, customer or dealer.
export async function listGrainLoans(
  filter: { productId?: string; customerId?: string; dealerId?: string } = {},
) {
  const shopId = await getCurrentShopId();
  const loans = await db.grainLoan.findMany({
    where: { shopId, ...filter },
    orderBy: { loanDate: "desc" },
    include: {
      product: { include: { unit: true } },
      customer: { select: { id: true, name: true } },
      dealer: { select: { id: true, name: true } },
      batch: { select: { quantitySold: true } },
      returns: {
        orderBy: { returnDate: "asc" },
        include: {
          bankAccount: { select: { name: true } },
          batch: { select: { quantitySold: true } },
        },
      },
    },
  });

  return loans.map((loan) => {
    const quantity = Number(loan.quantity);
    const returned = loan.returns.reduce(
      (s, r) => s + Number(r.quantityReturned),
      0,
    );
    const paid = loan.returns.reduce((s, r) => s + Number(r.quantityPaid), 0);
    const outstanding = Math.max(round3(quantity - returned - paid), 0);
    return {
      id: loan.id,
      direction: loan.direction,
      productId: loan.productId,
      productName: loan.product.name,
      unitName: loan.product.unit.name,
      party: loan.customer
        ? {
            kind: "CUSTOMER" as const,
            id: loan.customer.id,
            name: loan.customer.name,
            href: `/dashboard/customers/${loan.customer.id}?tab=grain-loans`,
          }
        : {
            kind: "DEALER" as const,
            id: loan.dealer!.id,
            name: loan.dealer!.name,
            href: `/dashboard/dealers/${loan.dealer!.id}?tab=grain-loans`,
          },
      customerId: loan.customerId,
      dealerId: loan.dealerId,
      quantity,
      rate: Number(loan.rate),
      loanDate: loan.loanDate,
      reference: loan.reference,
      notes: loan.notes,
      returned: round3(returned),
      paid: round3(paid),
      amountPaid: round2(
        loan.returns.reduce((s, r) => s + Number(r.amount), 0),
      ),
      outstanding,
      // Borrowed grain already sold from its batch — the loan can't be
      // edited below this.
      soldFromBatch: loan.batch ? Number(loan.batch.quantitySold) : 0,
      returns: loan.returns.map((r) => ({
        id: r.id,
        quantityReturned: Number(r.quantityReturned),
        quantityPaid: Number(r.quantityPaid),
        amount: Number(r.amount),
        paymentMethod: r.paymentMethod as "CASH" | "ACCOUNT" | null,
        bankAccountId: r.bankAccountId,
        bankAccountName: r.bankAccount?.name ?? null,
        returnDate: r.returnDate,
        reference: r.reference,
      })),
    };
  });
}

// Still-owed totals for one grain: what parties owe the shop (lent
// out) and what the shop owes back (borrowed).
export async function getGrainLoanTotals(productId: string) {
  const rows = await listGrainLoans({ productId });
  return {
    lentOut: round3(
      rows
        .filter((r) => r.direction === "SHOP_LENT")
        .reduce((s, r) => s + r.outstanding, 0),
    ),
    borrowed: round3(
      rows
        .filter((r) => r.direction === "SHOP_BORROWED")
        .reduce((s, r) => s + r.outstanding, 0),
    ),
  };
}
