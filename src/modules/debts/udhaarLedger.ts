import { db } from "@/lib/db";
import { allocateOldestFirst, type Allocated } from "@/lib/udhaarAllocation";

// The one place that decides what a customer owes the shop and how
// their payments have cleared it. Every Udhaar figure in the app —
// Udhaar page tabs, Defaulters, customer page totals, Udhaar
// clearance, Grain Udhaar rows — is derived from this, so they can
// never disagree.
//
// What counts (customer-owes-shop side only; isShopBorrowed rows are
// the opposite direction and grain settlement/grain-debt rows — any
// row with a quantity — are the shop owing the customer):
//   - Charges: every OUT row — a sale's Udhaar charge, Udhaar given,
//     an imported old balance, a Long-term loan.
//   - Payments: every IN row with no linkedSaleId — one pooled pot,
//     spread over the charges oldest-first (allocateOldestFirst).
//   - An IN row WITH a linkedSaleId is a sale edit/delete reversing
//     its own charge, so it reduces that charge instead of counting
//     as money received.

// A week's grace after the due date before an entry counts as overdue
// — the one definition used everywhere (see debts/actions.ts).
export const GRACE_PERIOD_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type UdhaarChargeKind = "SALE" | "IMPORTED" | "LONG_TERM" | "GIVEN";

export type UdhaarCharge = {
  id: string;
  date: Date;
  amount: number;
  kind: UdhaarChargeKind;
  // e.g. "DAP, Cotton" for a sale; the notes for anything else.
  description: string;
  isLongTerm: boolean;
  dueDate: Date | null;
  reference: string | null;
  linkedSaleId: string | null;
  visitAt: Date | null;
  customerAccountId: string;
  isLoanAccount: boolean;
};

export type AllocatedUdhaarCharge = Allocated<UdhaarCharge> & { isOverdue: boolean };

export type CustomerUdhaar = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  // The customer's Udhaar (loan-type) account, where a new payment is
  // posted — null if they don't have one yet.
  udhaarAccountId: string | null;
  // Oldest first.
  charges: AllocatedUdhaarCharge[];
  totalCharged: number;
  totalPaid: number;
  // What's still owed (never negative).
  balance: number;
  // Paid beyond every charge (only possible after a paid entry is
  // later deleted) — shown as an advance, never as a negative balance.
  unapplied: number;
};

function isOverdueDate(dueDate: Date | null, now: number) {
  return dueDate !== null && dueDate.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY < now;
}

// asOf: only entries up to that moment — the balance as it stood then
// (a ledger receipt's opening/closing balance). Omitted = today.
export async function loadCustomerUdhaar(
  shopId: string,
  customerId?: string,
  asOf?: Date
): Promise<Map<string, CustomerUdhaar>> {
  const [txns, udhaarAccounts] = await Promise.all([
    db.accountTransaction.findMany({
      where: {
        isShopBorrowed: false,
        quantity: null,
        transactionDate: asOf ? { lte: asOf } : undefined,
        customerAccount: { customerId: customerId || undefined, customer: { shopId } },
      },
      include: {
        customerAccount: { include: { customer: true, accountType: true } },
        linkedSale: { include: { items: { include: { product: true } } } },
      },
      orderBy: { transactionDate: "asc" },
    }),
    db.customerAccount.findMany({
      where: { customerId: customerId || undefined, customer: { shopId }, accountType: { isLoan: true } },
      select: { id: true, customerId: true },
    }),
  ]);

  type Bucket = { customer: { id: string; name: string; phone: string | null }; charges: UdhaarCharge[]; paid: number };
  const byCustomer = new Map<string, Bucket>();
  const reversals: typeof txns = [];

  for (const txn of txns) {
    const customer = txn.customerAccount.customer;
    let bucket = byCustomer.get(customer.id);
    if (!bucket) {
      bucket = { customer: { id: customer.id, name: customer.name, phone: customer.phone }, charges: [], paid: 0 };
      byCustomer.set(customer.id, bucket);
    }

    if (txn.direction === "IN") {
      if (txn.linkedSaleId) reversals.push(txn);
      else bucket.paid += Number(txn.amount);
      continue;
    }

    const visitItems = txn.linkedSale
      ? txn.linkedSale.items.filter((i) => !txn.visitAt || i.visitAt.getTime() === txn.visitAt.getTime())
      : [];
    const kind: UdhaarChargeKind = txn.linkedSaleId
      ? "SALE"
      : txn.notes?.startsWith("Imported from register")
        ? "IMPORTED"
        : txn.isLongTerm
          ? "LONG_TERM"
          : "GIVEN";

    bucket.charges.push({
      id: txn.id,
      date: txn.transactionDate,
      amount: Number(txn.amount),
      kind,
      description:
        kind === "SALE"
          ? [...new Set(visitItems.map((i) => i.product.name))].join(", ") || "Sale"
          : txn.notes || (kind === "LONG_TERM" ? "Long-term loan" : "Udhaar given"),
      isLongTerm: txn.isLongTerm,
      dueDate: txn.dueDate,
      reference: txn.reference,
      linkedSaleId: txn.linkedSaleId,
      visitAt: txn.visitAt,
      customerAccountId: txn.customerAccountId,
      isLoanAccount: txn.customerAccount.accountType.isLoan,
    });
  }

  // A sale's reversal cancels (part of) that same sale's charge; one
  // with no matching charge left is treated as money received.
  for (const rev of reversals) {
    const bucket = byCustomer.get(rev.customerAccount.customerId)!;
    let left = Number(rev.amount);
    for (const charge of bucket.charges) {
      if (left <= 0) break;
      const sameVisit =
        charge.linkedSaleId === rev.linkedSaleId &&
        (charge.visitAt?.getTime() ?? null) === (rev.visitAt?.getTime() ?? null);
      if (!sameVisit || charge.amount <= 0) continue;
      const cut = Math.min(charge.amount, left);
      charge.amount -= cut;
      left -= cut;
    }
    if (left > 0.001) bucket.paid += left;
  }

  const udhaarAccountByCustomer = new Map(udhaarAccounts.map((a) => [a.customerId, a.id]));
  const now = Date.now();
  const result = new Map<string, CustomerUdhaar>();

  for (const [id, bucket] of byCustomer) {
    const charges = bucket.charges.filter((c) => c.amount > 0.001);
    const { charges: allocated, unapplied } = allocateOldestFirst(charges, bucket.paid);
    const totalCharged = allocated.reduce((sum, c) => sum + c.amount, 0);
    const balance = allocated.reduce((sum, c) => sum + c.remaining, 0);

    result.set(id, {
      customerId: id,
      customerName: bucket.customer.name,
      customerPhone: bucket.customer.phone,
      udhaarAccountId: udhaarAccountByCustomer.get(id) ?? null,
      charges: allocated.map((c) => ({ ...c, isOverdue: c.remaining > 0.01 && isOverdueDate(c.dueDate, now) })),
      totalCharged,
      totalPaid: totalCharged - balance,
      balance,
      unapplied,
    });
  }

  return result;
}

// ── Shop owes customer ──
// The mirror ledger: what the shop owes a customer and how its
// repayments have cleared it, oldest entry first — same pooled model
// as the customer side, so the shopkeeper repays one total instead of
// per entry/product.
//   - Charges: money the shop borrowed from them (isShopBorrowed OUT,
//     incl. an imported "shop owes customer" balance) and grain the
//     shop bought from them on Udhaar (a CREDIT grain settlement — OUT
//     with a quantity and its grain batch).
//   - Repayments: every isShopBorrowed IN (borrowed-money repayments
//     and the pooled repayment) plus every older per-product grain
//     payment (IN with a quantity) — one pot.

export type ShopOwesChargeKind = "BORROWED" | "IMPORTED" | "GRAIN";

export type ShopOwesCharge = {
  id: string;
  date: Date;
  amount: number;
  kind: ShopOwesChargeKind;
  description: string;
  dueDate: Date | null;
  reference: string | null;
  // GRAIN only.
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  unitName: string | null;
  rate: number | null;
};

export type AllocatedShopOwesCharge = Allocated<ShopOwesCharge> & { isOverdue: boolean };

export type ShopOwesCustomer = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  // Oldest first.
  charges: AllocatedShopOwesCharge[];
  totalCharged: number;
  totalPaid: number;
  balance: number;
  // Repaid beyond every charge (only after a repaid entry is deleted).
  unapplied: number;
};

export async function loadShopOwesCustomer(
  shopId: string,
  customerId?: string,
  asOf?: Date
): Promise<Map<string, ShopOwesCustomer>> {
  const txns = await db.accountTransaction.findMany({
    where: {
      customerAccount: { customerId: customerId || undefined, customer: { shopId } },
      transactionDate: asOf ? { lte: asOf } : undefined,
      OR: [
        { isShopBorrowed: true },
        { isShopBorrowed: false, quantity: { not: null }, direction: "OUT", paymentMethod: "CREDIT" },
        { isShopBorrowed: false, quantity: { not: null }, direction: "IN" },
      ],
    },
    include: {
      customerAccount: { include: { customer: true } },
      linkedGrainBatch: { include: { product: { include: { unit: true } } } },
    },
    orderBy: { transactionDate: "asc" },
  });

  type Bucket = { customer: { id: string; name: string; phone: string | null }; charges: ShopOwesCharge[]; paid: number };
  const byCustomer = new Map<string, Bucket>();

  for (const txn of txns) {
    const customer = txn.customerAccount.customer;
    let bucket = byCustomer.get(customer.id);
    if (!bucket) {
      bucket = { customer: { id: customer.id, name: customer.name, phone: customer.phone }, charges: [], paid: 0 };
      byCustomer.set(customer.id, bucket);
    }

    if (txn.direction === "IN") {
      bucket.paid += Number(txn.amount);
      continue;
    }

    const batch = txn.linkedGrainBatch;
    if (!txn.isShopBorrowed && !batch) continue; // a grain OUT with no batch isn't a purchase
    const kind: ShopOwesChargeKind = !txn.isShopBorrowed
      ? "GRAIN"
      : txn.notes?.startsWith("Imported from register")
        ? "IMPORTED"
        : "BORROWED";

    bucket.charges.push({
      id: txn.id,
      date: txn.transactionDate,
      amount: Number(txn.amount),
      kind,
      description:
        kind === "GRAIN"
          ? `${batch!.product.name} — ${Number(txn.quantity)} ${batch!.product.unit.name}`
          : txn.notes || "Borrowed from customer",
      dueDate: txn.dueDate,
      reference: txn.reference,
      productId: batch?.productId ?? null,
      productName: batch?.product.name ?? null,
      quantity: kind === "GRAIN" ? Number(txn.quantity) : null,
      unitName: batch?.product.unit.name ?? null,
      rate: batch?.rate != null ? Number(batch.rate) : null,
    });
  }

  const now = Date.now();
  const result = new Map<string, ShopOwesCustomer>();
  for (const [id, bucket] of byCustomer) {
    const { charges: allocated, unapplied } = allocateOldestFirst(bucket.charges, bucket.paid);
    const totalCharged = allocated.reduce((sum, c) => sum + c.amount, 0);
    const balance = allocated.reduce((sum, c) => sum + c.remaining, 0);
    result.set(id, {
      customerId: id,
      customerName: bucket.customer.name,
      customerPhone: bucket.customer.phone,
      charges: allocated.map((c) => ({ ...c, isOverdue: c.remaining > 0.01 && isOverdueDate(c.dueDate, now) })),
      totalCharged,
      totalPaid: totalCharged - balance,
      balance,
      unapplied,
    });
  }
  return result;
}
