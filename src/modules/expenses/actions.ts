"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { parseLocalDateStart, parseLocalDateEnd } from "@/lib/utils";
import { postToBankAccount } from "@/modules/settings/bankAccounts.actions";
import {
  expenseSchema,
  updateExpenseSchema,
  monthlyExpenseSchema,
  updateMonthlyExpenseSchema,
  payExpenseDebtSchema,
  type ExpenseInput,
  type UpdateExpenseInput,
  type MonthlyExpenseInput,
  type UpdateMonthlyExpenseInput,
  type PayExpenseDebtInput,
} from "./schema";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

const DEFAULT_PAGE_SIZE = 50;

// Combines a picked "YYYY-MM-DD" with the CURRENT time-of-day (never
// midnight) so multiple expenses entered for the same past date in
// one sitting still sort distinctly — same convention
// resolveSaleDateTime (daily-sales/actions.ts) uses for backdated
// sales.
function resolveExpenseDateTime(dateStr: string): Date {
  const now = new Date();
  const picked = parseLocalDateStart(dateStr);
  picked.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return picked;
}

// ── Daily expenses ─────────────────────────────────────────
// Feed Cash Flow's daily register (see cash-flow/actions.ts's
// sumCashOut) — every write here is explicitly tagged expenseType:
// "DAILY" so it's never ambiguous with a Monthly row at the database
// level, even though both share the same Expense table.

export async function createExpense(input: ExpenseInput) {
  const shopId = await getCurrentShopId();
  const data = expenseSchema.parse(input);

  const expense = await db.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        shopId,
        description: data.description,
        amount: data.amount,
        expenseDate: resolveExpenseDateTime(data.expenseDate),
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        expenseType: "DAILY",
      },
    });
    // An expense is money LEAVING the shop.
    if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
      await postToBankAccount(tx, data.bankAccountId, -data.amount);
    }
    return created;
  });
  return serializeDecimals(expense);
}

export async function updateExpense(
  input: UpdateExpenseInput
): Promise<ActionResult<ReturnType<typeof serializeDecimals>>> {
  const shopId = await getCurrentShopId();
  const data = updateExpenseSchema.parse(input);

  const existing = await db.expense.findFirst({ where: { id: data.id, shopId, expenseType: "DAILY" } });
  if (!existing) return fail("Expense not found");

  const expense = await db.$transaction(async (tx) => {
    // Reverse the old posting (if any) before applying the new one —
    // an edit can change amount, payment method, AND bank account all
    // at once, so the only safe approach is undo-then-redo rather than
    // trying to diff the two.
    if (existing.paymentMethod === "ACCOUNT" && existing.bankAccountId) {
      await postToBankAccount(tx, existing.bankAccountId, Number(existing.amount));
    }
    const updated = await tx.expense.update({
      where: { id: data.id },
      data: {
        description: data.description,
        amount: data.amount,
        expenseDate: resolveExpenseDateTime(data.expenseDate),
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId ?? null,
      },
    });
    if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
      await postToBankAccount(tx, data.bankAccountId, -data.amount);
    }
    return updated;
  });
  return ok(serializeDecimals(expense));
}

// Shared by both Daily and Monthly expenses — deleting is identical
// either way, and the id already scopes which row it removes.
export async function deleteExpense(id: string): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();

  const existing = await db.expense.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Expense not found");

  await db.$transaction(async (tx) => {
    if (existing.paymentMethod === "ACCOUNT" && existing.bankAccountId) {
      await postToBankAccount(tx, existing.bankAccountId, Number(existing.amount));
    }
    await tx.expense.delete({ where: { id } });
  });
  return ok(null);
}

// Filterable by date range, per the milestone doc. Summary rows are
// enough here — there's no line-item detail to drill into, unlike
// Daily Sales. Only ever returns DAILY rows — Monthly expenses have
// their own listMonthlyExpenses below, kept as a fully separate list
// per the "two clearly separated sections" request.
export async function listExpenses(options?: {
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = {
    shopId,
    expenseType: "DAILY" as const,
    expenseDate: {
      gte: options?.fromDate ? parseLocalDateStart(options.fromDate) : undefined,
      lte: options?.toDate ? parseLocalDateEnd(options.toDate) : undefined,
    },
  };

  const [expenses, totalCount] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: { expenseDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.expense.count({ where }),
  ]);

  return {
    expenses: expenses.map(serializeDecimals),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

// ── Shop Udhaar (unpaid Credit expenses) ────────────────────
// A CREDIT expense (Daily or Monthly — a shop debt is a shop debt
// either way) is recorded once, same as any expense, but isn't
// actually paid yet. This section tracks paying it off later via
// ExpensePayment, mirroring stock/actions.ts's payGrainDebt.

// Every CREDIT expense that still has a positive remainder, with its
// own borrowed/paid/remaining figures — the Udhaar (Shop) tab's table
// data source. Unlike listExpenses, this spans BOTH Daily and Monthly
// (a shop debt is a shop debt regardless of which expense list it
// came from) and is never paginated — a shop realistically has few
// outstanding Credit expenses at once, same scale assumption
// listDebtors makes for customer accounts.
export async function listShopExpenseUdhaar() {
  const shopId = await getCurrentShopId();

  const expenses = await db.expense.findMany({
    where: { shopId, paymentMethod: "CREDIT" },
    include: { payments: true, monthlyExpenseType: true },
    orderBy: { expenseDate: "desc" },
  });

  return expenses
    .map((e) => {
      const borrowed = Number(e.amount);
      const paid = e.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return {
        id: e.id,
        description: e.monthlyExpenseType?.name ?? e.description,
        expenseType: e.expenseType,
        expenseDate: e.expenseDate,
        borrowed,
        paid,
        remaining: borrowed - paid,
      };
    })
    .filter((e) => e.remaining > 0.01);
}

// Stat-card totals for the Udhaar (Shop) tab — same shape as
// getDebtSummary, scoped to Credit expenses instead of customer
// accounts.
export async function getShopExpenseUdhaarSummary() {
  const rows = await listShopExpenseUdhaar();

  const totalBorrowed = rows.reduce((sum, r) => sum + r.borrowed, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0);
  const totalRemaining = rows.reduce((sum, r) => sum + r.remaining, 0);

  return {
    totalBorrowed,
    totalPaid,
    totalRemaining,
    count: rows.length,
  };
}

// Pays down a CREDIT expense — amount is capped at that expense's own
// outstanding remainder, never trusted from the client. Supports
// partial payments; the expense simply stops appearing in
// listShopExpenseUdhaar once its remainder reaches zero.
export async function payExpenseDebt(input: PayExpenseDebtInput): Promise<ActionResult<null>> {
  const shopId = await getCurrentShopId();
  const data = payExpenseDebtSchema.parse(input);

  const expense = await db.expense.findFirst({
    where: { id: data.expenseId, shopId, paymentMethod: "CREDIT" },
    include: { payments: true },
  });
  if (!expense) return fail("Expense not found");

  const paidSoFar = expense.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Number(expense.amount) - paidSoFar;
  if (data.amount > remaining + 0.01) {
    return fail(
      `This payment (Rs ${data.amount}) is more than what's actually owed (Rs ${remaining}) — a payment can't exceed what's owed.`
    );
  }

  await db.$transaction(async (tx) => {
    await tx.expensePayment.create({
      data: {
        expenseId: expense.id,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        notes: data.notes,
      },
    });
    if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
      await postToBankAccount(tx, data.bankAccountId, -data.amount);
    }
  });
  return ok(null);
}

// ── Monthly expense types (Settings-managed) ────────────────
// Same shape/pattern as Category/Unit — a shopkeeper-maintained list,
// never hardcoded.

export async function createMonthlyExpenseType(
  name: string
): Promise<ActionResult<Awaited<ReturnType<typeof db.monthlyExpenseType.create>>>> {
  const shopId = await getCurrentShopId();
  if (!name.trim()) return fail("Name is required");

  return ok(await db.monthlyExpenseType.create({ data: { shopId, name: name.trim() } }));
}

export async function listMonthlyExpenseTypes(includeInactive = false) {
  const shopId = await getCurrentShopId();

  return db.monthlyExpenseType.findMany({
    where: { shopId, isActive: includeInactive ? undefined : true },
    orderBy: { name: "asc" },
  });
}

export async function updateMonthlyExpenseType(
  id: string,
  data: { name?: string; isActive?: boolean }
): Promise<ActionResult<Awaited<ReturnType<typeof db.monthlyExpenseType.update>>>> {
  const shopId = await getCurrentShopId();

  const existing = await db.monthlyExpenseType.findFirst({ where: { id, shopId } });
  if (!existing) return fail("Monthly expense type not found");

  return ok(await db.monthlyExpenseType.update({ where: { id }, data }));
}

// ── Monthly expenses ─────────────────────────────────────────
// Recorded here for now but deliberately NOT wired into Cash Flow or
// anything else yet — that's future work, once Cash Flow grows a
// monthly-level view to fold them into (see schema.prisma's
// ExpenseType comment). A monthly expense always picks a
// MonthlyExpenseType instead of typing free text.

export async function createMonthlyExpense(
  input: MonthlyExpenseInput
): Promise<ActionResult<ReturnType<typeof serializeDecimals>>> {
  const shopId = await getCurrentShopId();
  const data = monthlyExpenseSchema.parse(input);

  const type = await db.monthlyExpenseType.findFirst({ where: { id: data.monthlyExpenseTypeId, shopId } });
  if (!type) return fail("Monthly expense type not found");

  const expense = await db.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        shopId,
        description: type.name,
        amount: data.amount,
        expenseDate: resolveExpenseDateTime(data.expenseDate),
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        expenseType: "MONTHLY",
        monthlyExpenseTypeId: type.id,
      },
    });
    if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
      await postToBankAccount(tx, data.bankAccountId, -data.amount);
    }
    return created;
  });
  return ok(serializeDecimals(expense));
}

export async function updateMonthlyExpense(
  input: UpdateMonthlyExpenseInput
): Promise<ActionResult<ReturnType<typeof serializeDecimals>>> {
  const shopId = await getCurrentShopId();
  const data = updateMonthlyExpenseSchema.parse(input);

  const existing = await db.expense.findFirst({ where: { id: data.id, shopId, expenseType: "MONTHLY" } });
  if (!existing) return fail("Monthly expense not found");

  const type = await db.monthlyExpenseType.findFirst({ where: { id: data.monthlyExpenseTypeId, shopId } });
  if (!type) return fail("Monthly expense type not found");

  const expense = await db.$transaction(async (tx) => {
    if (existing.paymentMethod === "ACCOUNT" && existing.bankAccountId) {
      await postToBankAccount(tx, existing.bankAccountId, Number(existing.amount));
    }
    const updated = await tx.expense.update({
      where: { id: data.id },
      data: {
        description: type.name,
        amount: data.amount,
        expenseDate: resolveExpenseDateTime(data.expenseDate),
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId ?? null,
        monthlyExpenseTypeId: type.id,
      },
    });
    if (data.paymentMethod === "ACCOUNT" && data.bankAccountId) {
      await postToBankAccount(tx, data.bankAccountId, -data.amount);
    }
    return updated;
  });
  return ok(serializeDecimals(expense));
}

export async function listMonthlyExpenses(options?: {
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const shopId = await getCurrentShopId();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const where = {
    shopId,
    expenseType: "MONTHLY" as const,
    expenseDate: {
      gte: options?.fromDate ? parseLocalDateStart(options.fromDate) : undefined,
      lte: options?.toDate ? parseLocalDateEnd(options.toDate) : undefined,
    },
  };

  const [expenses, totalCount] = await Promise.all([
    db.expense.findMany({
      where,
      include: { monthlyExpenseType: true },
      orderBy: { expenseDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.expense.count({ where }),
  ]);

  return {
    expenses: expenses.map((e) => ({
      ...serializeDecimals(e),
      monthlyExpenseType: e.monthlyExpenseType ? { id: e.monthlyExpenseType.id, name: e.monthlyExpenseType.name } : null,
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}
