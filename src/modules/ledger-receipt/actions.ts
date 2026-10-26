"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { parseLocalDateStart, parseLocalDateEnd } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { collectLedgerRows, type LedgerRow } from "@/modules/ledger/ledgerRows";
import {
  loadCustomerUdhaar,
  loadShopOwesCustomer,
} from "@/modules/debts/udhaarLedger";
import { ledgerReceiptSchema, type LedgerReceiptInput } from "./schema";

const round = (n: number) => Math.round(n * 100) / 100;

const METHOD_LABEL = {
  CASH: "Cash",
  ACCOUNT: "Bank",
  CREDIT: "Udhaar",
} as const;

export type LedgerReceiptBalance = {
  customerOwes: number;
  shopOwes: number;
  // Grain loans still open, per grain: lent = the customer owes the
  // shop this much grain back; borrowed = the shop owes them.
  grainLoans: {
    productName: string;
    unitName: string;
    lent: number;
    borrowed: number;
  }[];
};

export type LedgerReceiptEntry = {
  id: string;
  date: Date;
  label: string;
  detail: string | null;
  // CREDIT = money (or grain) coming to the shop, DEBIT = going out.
  side: "CREDIT" | "DEBIT";
  amount: number;
  // Grain-only entries move no money (a drop-off, a grain loan).
  stockOnly: boolean;
  // How it was paid, e.g. "Cash", "Udhaar", "Cash 3,000 + Udhaar 2,000".
  payment: string | null;
  // A sale's products, for printing line by line.
  items: {
    productName: string;
    quantity: number;
    unitName: string;
    price: number;
  }[];
};

export type LedgerReceipt = {
  customer: { id: string; name: string; phone: string | null };
  fromDate: string;
  toDate: string;
  opening: LedgerReceiptBalance;
  closing: LedgerReceiptBalance;
  // Oldest first, like a register.
  entries: LedgerReceiptEntry[];
};

// Where the customer and the shop stood at one moment: Udhaar each way
// (same ledgers as the customer page, cut off at that moment) and
// grain loans still open then.
async function balanceAt(
  shopId: string,
  customerId: string,
  asOf: Date,
): Promise<LedgerReceiptBalance> {
  const [udhaar, shopOwes, loans] = await Promise.all([
    loadCustomerUdhaar(shopId, customerId, asOf),
    loadShopOwesCustomer(shopId, customerId, asOf),
    db.grainLoan.findMany({
      where: { shopId, customerId, loanDate: { lte: asOf } },
      include: {
        product: { include: { unit: true } },
        returns: { where: { returnDate: { lte: asOf } } },
      },
    }),
  ]);

  const byProduct = new Map<
    string,
    LedgerReceiptBalance["grainLoans"][number]
  >();
  for (const loan of loans) {
    const settled = loan.returns.reduce(
      (s, r) => s + Number(r.quantityReturned) + Number(r.quantityPaid),
      0,
    );
    const open = Number(loan.quantity) - settled;
    if (open <= 0.0005) continue;
    const row = byProduct.get(loan.productId) ?? {
      productName: loan.product.name,
      unitName: loan.product.unit.name,
      lent: 0,
      borrowed: 0,
    };
    if (loan.direction === "SHOP_LENT") row.lent += open;
    else row.borrowed += open;
    byProduct.set(loan.productId, row);
  }

  return {
    customerOwes: round(udhaar.get(customerId)?.balance ?? 0),
    shopOwes: round(shopOwes.get(customerId)?.balance ?? 0),
    grainLoans: [...byProduct.values()].map((g) => ({
      ...g,
      lent: Number(g.lent.toFixed(3)),
      borrowed: Number(g.borrowed.toFixed(3)),
    })),
  };
}

function paymentText(row: LedgerRow): string | null {
  if (row.stockOnly) return null;
  const parts = (row.splits ?? []).filter((p) => p.amount > 0.005);
  if (parts.length > 1) {
    return parts
      .map(
        (p) =>
          `${METHOD_LABEL[p.method]} ${Math.round(p.amount).toLocaleString("en-US")}`,
      )
      .join(" + ");
  }
  const method = parts.length > 0 ? parts[0].method : row.paymentMethod;
  return method && method !== "MIXED" ? METHOD_LABEL[method] : null;
}

// A customer's ledger receipt for a date range: their balance with the
// shop on the morning of the first day, every entry between them in
// the range (sales, payments either way, loans, grain bought, kept or
// lent/borrowed), and the balance at the end of the last day. Built
// from the same rows as Daily sales, so the two always agree.
export async function getCustomerLedgerReceipt(
  input: LedgerReceiptInput,
): Promise<ActionResult<LedgerReceipt>> {
  return buildLedgerReceipt(await getCurrentShopId(), input);
}

async function buildLedgerReceipt(
  shopId: string,
  input: LedgerReceiptInput,
): Promise<ActionResult<LedgerReceipt>> {
  const parsed = ledgerReceiptSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "Check the dates");
  const { customerId, fromDate, toDate } = parsed.data;

  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: { id: true, name: true, phone: true },
  });
  if (!customer) return fail("Customer not found.");

  const start = parseLocalDateStart(fromDate);
  const end = parseLocalDateEnd(toDate);
  const range = { gte: start, lte: end };

  const [rows, saleItems, opening, closing] = await Promise.all([
    collectLedgerRows(shopId, range, { customerId }),
    db.dailySaleItem.findMany({
      where: { visitAt: range, dailySale: { shopId, customerId } },
      include: { product: { include: { unit: true } } },
      orderBy: { id: "asc" },
    }),
    balanceAt(shopId, customerId, new Date(start.getTime() - 1)),
    balanceAt(shopId, customerId, end),
  ]);

  const itemsByVisit = new Map<string, LedgerReceiptEntry["items"]>();
  for (const item of saleItems) {
    const key = `${item.dailySaleId}:${item.visitAt.getTime()}`;
    const list = itemsByVisit.get(key) ?? [];
    list.push({
      productName: item.product.name,
      quantity: Number(item.quantity),
      unitName: item.product.unit.name,
      price: Number(item.actualPrice),
    });
    itemsByVisit.set(key, list);
  }

  const entries: LedgerReceiptEntry[] = rows
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((row) => ({
      id: row.id,
      date: row.date,
      label: row.label,
      detail: row.saleId ? null : row.detail,
      side: row.side,
      amount: round(row.amount),
      stockOnly: !!row.stockOnly,
      payment: paymentText(row),
      items:
        row.saleId && row.visitAt
          ? (itemsByVisit.get(`${row.saleId}:${row.visitAt.getTime()}`) ?? [])
          : [],
    }));

  return ok({ customer, fromDate, toDate, opening, closing, entries });
}

// ── Saved ledger receipts (Receipts → Ledger receipts) ──

export type SavedLedgerReceiptSummary = {
  id: string;
  receiptNumber: number;
  customerId: string;
  customerName: string;
  fromDate: string;
  toDate: string;
  entryCount: number;
  createdAt: Date;
};

// "Create receipt": builds the customer's ledger receipt for the dates
// on the server (never trusting a copy from the browser) and keeps it
// exactly as it is now, with the next ledger receipt number.
export async function createLedgerReceipt(
  input: LedgerReceiptInput,
): Promise<ActionResult<{ id: string; receiptNumber: number }>> {
  const shopId = await getCurrentShopId();
  const built = await buildLedgerReceipt(shopId, input);
  if (!built.success) return built;
  const receipt = built.data;

  const saved = await db.$transaction(async (tx) => {
    const last = await tx.savedLedgerReceipt.findFirst({
      where: { shopId },
      orderBy: { receiptNumber: "desc" },
      select: { receiptNumber: true },
    });
    return tx.savedLedgerReceipt.create({
      data: {
        shopId,
        receiptNumber: (last?.receiptNumber ?? 0) + 1,
        customerId: receipt.customer.id,
        fromDate: receipt.fromDate,
        toDate: receipt.toDate,
        data: JSON.parse(JSON.stringify(receipt)) as Prisma.InputJsonValue,
      },
    });
  });
  return ok({ id: saved.id, receiptNumber: saved.receiptNumber });
}

// Ledger receipts created on one day ("YYYY-MM-DD"), newest first.
export async function listSavedLedgerReceipts(
  date: string,
): Promise<SavedLedgerReceiptSummary[]> {
  const shopId = await getCurrentShopId();
  const saved = await db.savedLedgerReceipt.findMany({
    where: {
      shopId,
      createdAt: {
        gte: parseLocalDateStart(date),
        lte: parseLocalDateEnd(date),
      },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { receiptNumber: "desc" },
  });
  return saved.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    customerId: r.customerId,
    customerName: r.customer.name,
    fromDate: r.fromDate,
    toDate: r.toDate,
    entryCount: (r.data as unknown as LedgerReceipt).entries?.length ?? 0,
    createdAt: r.createdAt,
  }));
}

export async function getSavedLedgerReceipt(id: string) {
  const shopId = await getCurrentShopId();
  const saved = await db.savedLedgerReceipt.findFirst({
    where: { id, shopId },
  });
  if (!saved) return null;
  return {
    id: saved.id,
    receiptNumber: saved.receiptNumber,
    createdAt: saved.createdAt,
    // Dates come back from JSON as text; every reader formats them
    // with formatDate, which takes either.
    receipt: saved.data as unknown as LedgerReceipt,
  };
}

export async function deleteSavedLedgerReceipt(
  id: string,
): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const { count } = await db.savedLedgerReceipt.deleteMany({
    where: { id, shopId },
  });
  if (count === 0) return fail("Receipt not found.");
  return ok(null);
}
