"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { parseLocalDateStart, parseLocalDateEnd } from "@/lib/utils";
import {
  expenseSchema,
  updateExpenseSchema,
  monthlyExpenseSchema,
  updateMonthlyExpenseSchema,
  type ExpenseInput,
  type UpdateExpenseInput,
  type MonthlyExpenseInput,
  type UpdateMonthlyExpenseInput,
} from "./schema";

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

  const expense = await db.expense.create({
    data: {
      shopId,
      description: data.description,
      amount: data.amount,
      expenseDate: resolveExpenseDateTime(data.expenseDate),
      paymentMethod: data.paymentMethod,
      expenseType: "DAILY",
    },
  });
  return serializeDecimals(expense);
}

export async function updateExpense(input: UpdateExpenseInput) {
  const shopId = await getCurrentShopId();
  const data = updateExpenseSchema.parse(input);

  const existing = await db.expense.findFirst({ where: { id: data.id, shopId, expenseType: "DAILY" } });
  if (!existing) throw new Error("Expense not found");

  const expense = await db.expense.update({
    where: { id: data.id },
    data: {
      description: data.description,
      amount: data.amount,
      expenseDate: resolveExpenseDateTime(data.expenseDate),
      paymentMethod: data.paymentMethod,
    },
  });
  return serializeDecimals(expense);
}

// Shared by both Daily and Monthly expenses — deleting is identical
// either way, and the id already scopes which row it removes.
export async function deleteExpense(id: string) {
  const shopId = await getCurrentShopId();

  const existing = await db.expense.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Expense not found");

  await db.expense.delete({ where: { id } });
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

// ── Monthly expense types (Settings-managed) ────────────────
// Same shape/pattern as Category/Unit — a shopkeeper-maintained list,
// never hardcoded.

export async function createMonthlyExpenseType(name: string) {
  const shopId = await getCurrentShopId();
  if (!name.trim()) throw new Error("Name is required");

  return db.monthlyExpenseType.create({ data: { shopId, name: name.trim() } });
}

export async function listMonthlyExpenseTypes(includeInactive = false) {
  const shopId = await getCurrentShopId();

  return db.monthlyExpenseType.findMany({
    where: { shopId, isActive: includeInactive ? undefined : true },
    orderBy: { name: "asc" },
  });
}

export async function updateMonthlyExpenseType(id: string, data: { name?: string; isActive?: boolean }) {
  const shopId = await getCurrentShopId();

  const existing = await db.monthlyExpenseType.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Monthly expense type not found");

  return db.monthlyExpenseType.update({ where: { id }, data });
}

// ── Monthly expenses ─────────────────────────────────────────
// Recorded here for now but deliberately NOT wired into Cash Flow or
// anything else yet — that's future work, once Cash Flow grows a
// monthly-level view to fold them into (see schema.prisma's
// ExpenseType comment). A monthly expense always picks a
// MonthlyExpenseType instead of typing free text.

export async function createMonthlyExpense(input: MonthlyExpenseInput) {
  const shopId = await getCurrentShopId();
  const data = monthlyExpenseSchema.parse(input);

  const type = await db.monthlyExpenseType.findFirst({ where: { id: data.monthlyExpenseTypeId, shopId } });
  if (!type) throw new Error("Monthly expense type not found");

  const expense = await db.expense.create({
    data: {
      shopId,
      description: type.name,
      amount: data.amount,
      expenseDate: resolveExpenseDateTime(data.expenseDate),
      paymentMethod: data.paymentMethod,
      expenseType: "MONTHLY",
      monthlyExpenseTypeId: type.id,
    },
  });
  return serializeDecimals(expense);
}

export async function updateMonthlyExpense(input: UpdateMonthlyExpenseInput) {
  const shopId = await getCurrentShopId();
  const data = updateMonthlyExpenseSchema.parse(input);

  const existing = await db.expense.findFirst({ where: { id: data.id, shopId, expenseType: "MONTHLY" } });
  if (!existing) throw new Error("Monthly expense not found");

  const type = await db.monthlyExpenseType.findFirst({ where: { id: data.monthlyExpenseTypeId, shopId } });
  if (!type) throw new Error("Monthly expense type not found");

  const expense = await db.expense.update({
    where: { id: data.id },
    data: {
      description: type.name,
      amount: data.amount,
      expenseDate: resolveExpenseDateTime(data.expenseDate),
      paymentMethod: data.paymentMethod,
      monthlyExpenseTypeId: type.id,
    },
  });
  return serializeDecimals(expense);
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
