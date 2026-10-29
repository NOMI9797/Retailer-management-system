"use server";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import { collectLedgerRows, type LedgerRow } from "@/modules/ledger/ledgerRows";
import { summarizeMoney } from "@/modules/cash-flow/cashFlowMath";
import { getCashFlowForDate } from "@/modules/cash-flow/actions";
import { loadCustomerUdhaar, loadShopOwesCustomer } from "@/modules/debts/udhaarLedger";
import { getDealerUdhaarTotals } from "@/modules/dealers/actions";
import { getStockOverview } from "@/modules/stock/actions";
import { getShopExpenseUdhaarSummary } from "@/modules/expenses/actions";
import { lowStockWhere } from "@/modules/products/lowStock";
import { formatStock } from "@/modules/products/units";
import { getProductStats } from "@/modules/products/products.actions";
import { getCashInHandRegister } from "@/modules/shop-register/actions";

const round = (n: number) => Math.round(n * 100) / 100;


// Per customer: customer owes shop − shop owes customer; the positive
// nets add up to Customers owe, the negative ones (as positive) to Owed
// to customers.
function netCustomerBalances(
  customerUdhaar: Map<string, { balance: number }>,
  shopOwes: Map<string, { balance: number }>
) {
  let customersOwe = 0;
  let shopOwesCustomers = 0;
  for (const id of new Set([...customerUdhaar.keys(), ...shopOwes.keys()])) {
    const net = (customerUdhaar.get(id)?.balance ?? 0) - (shopOwes.get(id)?.balance ?? 0);
    if (net > 0) customersOwe += net;
    else shopOwesCustomers -= net;
  }
  return { customersOwe, shopOwesCustomers };
}
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
    productStats,
    expenseUdhaar,
    lowStockCount,
    outOfStockCount,
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
    // The first few (out of stock first, then fewest left); the rest
    // are on the Low stock page.
    db.product.findMany({
      where: lowStockWhere(shopId),
      include: { unit: true, subUnit: true },
      orderBy: [{ quantity: "asc" }, { name: "asc" }],
      take: 8,
    }),
    db.bankAccount.findMany({ where: { shopId }, orderBy: { name: "asc" } }),
    // Products in stock, valued at what the shop paid (cost price).
    // The Products page's own Stock value card — the same figure here.
    getProductStats(),
    getShopExpenseUdhaarSummary(),
    db.product.count({ where: lowStockWhere(shopId) }),
    db.product.count({ where: { ...lowStockWhere(shopId), quantity: { lte: 0 } } }),
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

  // Who is overdue (any charge past its due date with something left on
  // it), most overdue first.
  const overdue: { customerId: string; name: string; overdue: number; balance: number }[] = [];
  for (const c of customerUdhaar.values()) {
    const overdueAmount = c.charges.filter((ch) => ch.isOverdue).reduce((s, ch) => s + ch.remaining, 0);
    if (overdueAmount > 0.01) {
      overdue.push({ customerId: c.customerId, name: c.customerName, overdue: round(overdueAmount), balance: round(c.balance) });
    }
  }
  overdue.sort((a, b) => b.overdue - a.overdue);
  // Each customer counts once, netted (like the Net card on their page):
  // what they owe the shop minus what the shop owes them. A customer who
  // owes more adds the difference to Customers owe; one the shop owes
  // more adds it to Owed to customers.
  const { customersOwe, shopOwesCustomers } = netCustomerBalances(customerUdhaar, shopOwes);

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
        atHomes: o.atCustomerHomes,
        borrowed: o.borrowed,
        // Finalized from the register: the opening Stock Udhaar left.
        opening: o.opening,
      };
    })
  );

  // Each grain as its Grain page cards show it (the register figure
  // where one is entered, else the records — which, for a grain
  // finalized from the register, include its opening Stock Udhaar still
  // to buy back, valued at break-even): one owing Stock Udhaar is listed
  // by what that's worth; otherwise by the stock it holds and its value.
  // Owing first, then biggest value first.
  const registerRows = await db.grainRegisterStock.findMany({ where: { shopId } });
  const registerFor = new Map(registerRows.map((r) => [r.productId, r]));
  const figure = (v: Prisma.Decimal | null | undefined, fallback: number) => (v != null ? Number(v) : fallback);
  const grainFigures = grain.map((g) => {
    const r = registerFor.get(g.id);
    const udhaarKg = figure(r?.stockUdhaarKg, g.stockUdhaar + (g.opening?.remainingKg ?? 0));
    return {
      id: g.id,
      name: g.name,
      unit: g.unit,
      status: udhaarKg > 0 ? ("UDHAAR" as const) : ("STOCK" as const),
      udhaarKg,
      udhaarValue:
        r?.stockUdhaarValue != null ? Number(r.stockUdhaarValue) : g.opening ? g.opening.remainingValue : null,
      stockKg: figure(r?.ownKg, g.own),
      stockValue: figure(r?.ownValue, Math.max(g.value, 0)),
      // The Dashboard's money cards count a grain once it has a figure
      // to count: entered from the register, or finalized into records.
      stockValueCounted: r?.ownValue != null ? Number(r.ownValue) : g.opening ? Math.max(g.value, 0) : 0,
    };
  });
  const grainPositions = grainFigures
    .map((g) => ({
      id: g.id,
      name: g.name,
      unit: g.unit,
      status: g.status,
      udhaarKg: g.udhaarKg,
      udhaarValue: g.udhaarValue,
      stockKg: g.stockKg,
      stockValue: g.stockValue,
    }))
    .filter((g) => g.status === "UDHAAR" || g.stockKg > 0)
    .sort((a, b) =>
      a.status !== b.status
        ? a.status === "UDHAAR" ? -1 : 1
        : a.status === "UDHAAR"
          ? (b.udhaarValue ?? 0) - (a.udhaarValue ?? 0)
          : b.stockValue - a.stockValue
    );

  const cashInHand =
    register.isClosed && register.actualClosing !== null ? register.actualClosing : register.expectedClosing;
  const cashInHandRegister = await getCashInHandRegister();

  // The shop's overall position — everything it has or is owed, against
  // everything it owes. Grain counts the shop's own grain (lent-out
  // grain included, borrowed grain excluded) at the rates it was bought
  // at; Stock Udhaar (grain owed back to depositors) is listed in kg,
  // since it has no agreed money value yet.
  const bankTotal = round(bankAccounts.reduce((s, b) => s + Number(b.currentBalance), 0));
  const productStockValue = round(productStats.stockValue);
  // Grain stock = each grain's Stock value: the register figure, or the
  // records once the grain is finalized from the register (a grain with
  // neither counts 0).
  const grainStockValue = round(grainFigures.reduce((s, g) => s + g.stockValueCounted, 0));
  const has = {
    // The register's figure (0 until one is entered), not the cash
    // records — the Today row's Cash in hand still shows those.
    cashInHand: round(cashInHandRegister ?? 0),
    bank: bankTotal,
    banks: bankAccounts.map((b) => ({ name: b.name, balance: Number(b.currentBalance) })),
    productStock: productStockValue,
    grainStock: grainStockValue,
    customersOwe: round(customersOwe),
    dealersOwe: round(dealers.netDealersOwe),
  };
  // Stock Udhaar's money value across every grain: the register's
  // Stock Udhaar value, or for a finalized grain its opening Stock
  // Udhaar still to buy back at break-even.
  const grainUdhaarValue = round(grainFigures.reduce((s, g) => s + (g.udhaarValue ?? 0), 0));
  const owesOut = {
    customers: round(shopOwesCustomers),
    dealers: round(dealers.netShopOwes),
    expenses: round(expenseUdhaar.totalRemaining),
    grainStock: grainUdhaarValue,
  };
  const totalHas = round(Object.entries(has).reduce((s, [k, v]) => (k === "banks" ? s : s + (v as number)), 0));
  const totalOwes = round(owesOut.customers + owesOut.dealers + owesOut.expenses + owesOut.grainStock);

  return {
    today,
    position: {
      has,
      // Cash in hand: the register's figure (null = not entered) and what
      // the cash records say, for the tile's pencil.
      cash: { register: cashInHandRegister, system: round(cashInHand) },
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
      dealersOwe: round(dealers.netDealersOwe),
      shopOwesDealers: round(dealers.netShopOwes),
    },
    grainPositions,
    overdue: overdue.slice(0, 5),
    lowStock: lowStock.map((p) => ({
      id: p.id,
      name: p.name,
      quantity: Number(p.quantity),
      left: formatStock(Number(p.quantity), p),
    })),
    lowStockCount,
    outOfStockCount,
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
