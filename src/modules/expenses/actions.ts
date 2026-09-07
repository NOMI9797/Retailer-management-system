"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { serializeDecimals } from "@/lib/serialize";
import { expenseSchema, updateExpenseSchema, type ExpenseInput, type UpdateExpenseInput } from "./schema";

const DEFAULT_PAGE_SIZE = 50;

export async function createExpense(input: ExpenseInput) {
  const shopId = await getCurrentShopId();
  const data = expenseSchema.parse(input);

  const expense = await db.expense.create({
    data: {
      shopId,
      description: data.description,
      amount: data.amount,
      expenseDate: new Date(data.expenseDate),
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
      expenseDate: new Date(data.expenseDate),
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

  // toDate is a plain "YYYY-MM-DD" from a <input type="date">, which
  // parses to that day's UTC midnight — pushed to the end of that
  // calendar day so the filter is inclusive of the whole "to" date.
  // Same fix as listDailySales' toDate handling.
  const toDateInclusive = options?.toDate ? new Date(options.toDate) : undefined;
  toDateInclusive?.setHours(23, 59, 59, 999);

  const where = {
    shopId,
    expenseDate: {
      gte: options?.fromDate ? new Date(options.fromDate) : undefined,
      lte: toDateInclusive,
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
