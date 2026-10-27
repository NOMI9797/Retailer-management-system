"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import { collectLedgerRows, type LedgerRow } from "@/modules/ledger/ledgerRows";
import { summarizeMoney } from "@/modules/cash-flow/cashFlowMath";
import { getCashFlowForDate } from "@/modules/cash-flow/actions";
import { loadCustomerUdhaar, loadShopOwesCustomer } from "@/modules/debts/udhaarLedger";
import { getDealerUdhaarTotals } from "@/modules/dealers/actions";
import { getStockOverview } from "@/modules/stock/actions";
import { getShopExpenseUdhaarSummary } from "@/modules/expenses/actions";

const round = (n: number) => Math.round(n * 100) / 100;
const dayKey = (d: Date) => toLocalDateString(d);

function shiftDays(dateStr: string, days: number) {
  const d = parseLocalDateStart(dateStr);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

// Sales total for a set of rows — the full sale amount, Udhaar part
// included (a sale on Udhaar is still a sale).
const salesTotal = (rows: LedgerRow[]) =>
  round(
    rows.filter((r) => r.label === "Sale").reduce((s, r) => s + r.amount, 0) -
      rows.filter((r) => r.label === "Sales return").reduce((s, r) => s + r.amount, 0)
  );

// Everything the Dashboard shows, in one fetch, all from the same
// records as Daily sales / Cash flow so the pages always agree:
// today's headline numbers with yesterday for comparison, the last 7
// days of money in/out, who owes what (customers, shop, dealers),
// each grain's position, what needs attention (overdue Udhaar, low
// stock) and today's latest entries. Not cached — a shopkeeper
// expects it to reflect the entry they just made.
export async function getDashboard() {
  const shopId = await getCurrentShopId();
  const today = dayKey(new Date());
  const yesterday = shiftDays(today, -1);
  const weekStart = shiftDays(today, -6);

  const [
    weekRows,
    register,
    customerUdhaar,
    shopOwes,
    dealers,
    grainProducts,
    lowStock,
    bankAccounts,
    stockedProducts,
    expenseUdhaar,
  ] = await Promise.all([
    collectLedgerRows(shopId, { gte: parseLocalDateStart(weekStart), lte: parseLocalDateEnd(today) }),
    getCashFlowForDate(today),
    loadCustomerUdhaar(shopId),
    loadShopOwesCustomer(shopId),
    getDealerUdhaarTotals(),
    db.product.findMany({
      where: { shopId, stockKind: "GRAIN", isActive: true, isDeleted: false },
      include: { unit: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { shopId, stockKind: "SIMPLE", isActive: true, isDeleted: false, tracksStock: true, quantity: { lte: 5 } },
      include: { unit: true },
      orderBy: { quantity: "asc" },
      take: 6,
    }),
    db.bankAccount.findMany({ where: { shopId }, orderBy: { name: "asc" } }),
    // Products in stock, valued at what the shop paid (cost price).
    db.product.findMany({
      where: { shopId, stockKind: "SIMPLE", isDeleted: false, tracksStock: true, quantity: { gt: 0 } },
      select: { quantity: true, costPrice: true },
    }),
    getShopExpenseUdhaarSummary(),
  ]);

  const rowsOn = (date: string) => weekRows.filter((r) => dayKey(r.date) === date);
  const todayRows = rowsOn(today);
  const yesterdayRows = rowsOn(yesterday);
  const todayMoney = summarizeMoney(todayRows);
  const yesterdayMoney = summarizeMoney(yesterdayRows);

  const week = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDays(weekStart, i);
    const s = summarizeMoney(rowsOn(date));
    return { date, in: s.moneyIn, out: s.moneyOut };
  });

  // Customers' Udhaar: total still owed, and who is overdue (any charge
  // past its due date with something left on it), most overdue first.
  let customersOwe = 0;
  const overdue: { customerId: string; name: string; overdue: number; balance: number }[] = [];
  for (const c of customerUdhaar.values()) {
    customersOwe += c.balance;
    const overdueAmount = c.charges.filter((ch) => ch.isOverdue).reduce((s, ch) => s + ch.remaining, 0);
    if (overdueAmount > 0.01) {
      overdue.push({ customerId: c.customerId, name: c.customerName, overdue: round(overdueAmount), balance: round(c.balance) });
    }
  }
  overdue.sort((a, b) => b.overdue - a.overdue);
  const shopOwesCustomers = [...shopOwes.values()].reduce((s, c) => s + c.balance, 0);

  const grain = await Promise.all(
    grainProducts.map(async (p) => {
      const o = await getStockOverview(p.id);
      return {
        id: p.id,
        name: p.name,
        unit: p.unit.name,
        own: o.ownAvailable,
        value: o.ownValue,
        stockUdhaar: o.stockUdhaarOutstanding,
        lentOut: o.lentOut,
        borrowed: o.borrowed,
      };
    })
  );

  const cashInHand =
    register.isClosed && register.actualClosing !== null ? register.actualClosing : register.expectedClosing;

  // The shop's overall position — everything it has or is owed, against
  // everything it owes. Grain counts the shop's own grain (lent-out
  // grain included, borrowed grain excluded) at the rates it was bought
  // at; Stock Udhaar (grain owed back to depositors) is listed in kg,
  // since it has no agreed money value yet.
  const bankTotal = round(bankAccounts.reduce((s, b) => s + Number(b.currentBalance), 0));
  const productStockValue = round(
    stockedProducts.reduce((s, p) => s + Number(p.quantity) * Number(p.costPrice ?? 0), 0)
  );
  const grainStockValue = round(grain.reduce((s, g) => s + Math.max(g.value, 0), 0));
  const has = {
    cashInHand: round(cashInHand),
    bank: bankTotal,
    banks: bankAccounts.map((b) => ({ name: b.name, balance: Number(b.currentBalance) })),
    productStock: productStockValue,
    grainStock: grainStockValue,
    customersOwe: round(customersOwe),
    dealersOwe: dealers.dealersOwe,
  };
  const owesOut = {
    customers: round(shopOwesCustomers),
    dealers: dealers.shopOwes,
    expenses: round(expenseUdhaar.totalRemaining),
  };
  const totalHas = round(Object.entries(has).reduce((s, [k, v]) => (k === "banks" ? s : s + (v as number)), 0));
  const totalOwes = round(owesOut.customers + owesOut.dealers + owesOut.expenses);

  return {
    today,
    position: {
      has,
      owes: owesOut,
      totalHas,
      totalOwes,
      netWorth: round(totalHas - totalOwes),
      stockUdhaar: grain
        .filter((g) => g.stockUdhaar > 0)
        .map((g) => ({ name: g.name, quantity: g.stockUdhaar, unit: g.unit })),
    },
    kpis: {
      sales: { today: salesTotal(todayRows), yesterday: salesTotal(yesterdayRows) },
      moneyIn: { today: todayMoney.moneyIn, yesterday: yesterdayMoney.moneyIn },
      moneyOut: { today: todayMoney.moneyOut, yesterday: yesterdayMoney.moneyOut },
      net: {
        today: round(todayMoney.moneyIn - todayMoney.moneyOut),
        yesterday: round(yesterdayMoney.moneyIn - yesterdayMoney.moneyOut),
      },
      cashInHand: { value: cashInHand, closed: register.isClosed },
    },
    week,
    owes: {
      customersOwe: round(customersOwe),
      overdueCount: overdue.length,
      shopOwesCustomers: round(shopOwesCustomers),
      dealersOwe: dealers.dealersOwe,
      shopOwesDealers: dealers.shopOwes,
    },
    grain: grain.filter((g) => g.own !== 0 || g.stockUdhaar > 0 || g.lentOut > 0 || g.borrowed > 0),
    overdue: overdue.slice(0, 5),
    lowStock: lowStock.map((p) => ({ id: p.id, name: p.name, quantity: Number(p.quantity), unit: p.unit.name })),
    recent: [...todayRows]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        label: r.label,
        name: r.counterpartyName,
        href: r.counterpartyHref,
        side: r.side,
        amount: r.amount,
        stockOnly: !!r.stockOnly,
        detail: r.detail,
        method: r.paymentMethod,
      })),
  };
}
