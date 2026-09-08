"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { parseLocalDateStart, parseLocalDateEnd } from "@/lib/utils";
import { expenseSchema, updateExpenseSchema, type ExpenseInput, type UpdateExpenseInput } from "./schema";

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
    },
  });
  return serializeDecimals(expense);
}

export async function updateExpense(input: UpdateExpenseInput) {
  const shopId = await getCurrentShopId();
  const data = updateExpenseSchema.parse(input);

  const existing = await db.expense.findFirst({ where: { id: data.id, shopId } });
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

export async function deleteExpense(id: string) {
  const shopId = await getCurrentShopId();

  const existing = await db.expense.findFirst({ where: { id, shopId } });
  if (!existing) throw new Error("Expense not found");

  await db.expense.delete({ where: { id } });
}

// Filterable by date range, per the milestone doc. Summary rows are
// enough here — there's no line-item detail to drill into, unlike
// Daily Sales.
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
