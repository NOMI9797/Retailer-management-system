"use server";

import { db } from "@/lib/db";
import { getCurrentShopId } from "@/lib/tenant";
import { parseLocalDateStart, parseLocalDateEnd, toLocalDateString } from "@/lib/utils";
import type { BankAccountRowDeleteRef } from "@/modules/settings/bankAccounts.actions";

export type LedgerSide = "CREDIT" | "DEBIT";

export type LedgerRow = {
  id: string;
  date: Date;
  // CREDIT = money in, DEBIT = money out, from the shop's point of view.
  side: LedgerSide;
  label: string;
  counterpartyName: string;
  counterpartyHref: string;
  detail: string | null;
  paymentMethod: "CASH" | "ACCOUNT" | "CREDIT" | "MIXED" | null;
  amount: number;
  // Set on sale rows only — sales keep their own Edit/Delete.
  saleId: string | null;
  // Which existing reversal deletes this row (see deleteBankAccountRow).
  // Null where the app has no safe reversal yet (dealer grain purchases).
  deleteRef: BankAccountRowDeleteRef | null;
};

const customerHref = (id: string) => `/dashboard/customers/${id}`;
const dealerHref = (id: string) => `/dashboard/dealers/${id}`;

// Every money-moving record in the shop for a date range, split into
// money in (Credit) and money out (Debit) — the Daily sales page's two
// columns. Merges every source table the same way
// listBankAccountTransactions does, but across all payment methods
// (cash, account, Udhaar), not just bank movements.
//
// Rows another row already represents are skipped so nothing counts
// twice: a credit sale's own Udhaar posting (linkedSaleId), a dealer
// product purchase's ledger rows (linkedPurchaseId), and the ledger row
// of a sale made to a dealer (isDealerSale).
//
// customerId / areaId / accountTypeId narrow to customer-linked rows,
// so while any of them is active, rows with no customer behind them
// (expenses, dealers) are left out. search matches the name shown on
// the row (customer, dealer, or expense description).
export async function listDailyLedger(options?: {
  fromDate?: string;
  toDate?: string;
  customerId?: string;
  search?: string;
  areaId?: string;
  accountTypeId?: string;
}) {
  const shopId = await getCurrentShopId();
  const today = toLocalDateString(new Date());
  const fromDate = options?.fromDate || options?.toDate || today;
  const toDate = options?.toDate || options?.fromDate || today;
  const range = { gte: parseLocalDateStart(fromDate), lte: parseLocalDateEnd(toDate) };

  const customerScoped = !!(options?.customerId || options?.areaId || options?.accountTypeId);
  const customerMatch = {
    shopId,
    id: options?.customerId || undefined,
    areaId: options?.areaId || undefined,
    accounts: options?.accountTypeId ? { some: { accountTypeId: options.accountTypeId } } : undefined,
  };
  const none = Promise.resolve([] as never[]);

  const [sales, accountTxns, grainCreditPayments, expenses, expensePayments, dealerPurchases, dealerTxns] =
    await Promise.all([
      db.dailySale.findMany({
        where: { shopId, saleDate: range, customer: customerScoped ? customerMatch : undefined },
        include: { customer: true, dealer: true, items: true, payments: true },
      }),
      db.accountTransaction.findMany({
        where: {
          transactionDate: range,
          linkedSaleId: null,
          customerAccount: { customer: customerMatch },
        },
        include: { customerAccount: { include: { customer: true } } },
      }),
      db.grainSaleCreditPayment.findMany({
        where: {
          paidAt: range,
          dailySaleItem: {
            product: { shopId },
            dailySale: { customer: customerScoped ? customerMatch : undefined },
          },
        },
        include: { dailySaleItem: { include: { product: true, dailySale: { include: { customer: true, dealer: true } } } } },
      }),
      customerScoped
        ? none
        : db.expense.findMany({ where: { shopId, expenseDate: range }, include: { monthlyExpenseType: true } }),
      customerScoped
        ? none
        : db.expensePayment.findMany({ where: { paidAt: range, expense: { shopId } }, include: { expense: true } }),
      customerScoped
        ? none
        : db.dealerProductPurchase.findMany({
            where: { purchaseDate: range, dealer: { shopId } },
            include: { dealer: true, product: true },
          }),
      customerScoped
        ? none
        : db.dealerTransaction.findMany({
            where: {
              transactionDate: range,
              linkedPurchaseId: null,
              // A sale's own dealer Udhaar charge is already the sale
              // row; dealer-side rows with no sale (a dealer paying the
              // shop back, an imported "dealer owes shop") are listed.
              OR: [{ isDealerSale: false }, { isDealerSale: true, linkedSaleId: null }],
              dealerAccount: { dealer: { shopId } },
            },
            include: { dealerAccount: { include: { dealer: true } } },
          }),
    ]);

  const rows: LedgerRow[] = [];

  for (const sale of sales) {
    const methods = Array.from(new Set(sale.payments.map((p) => p.paymentMethod)));
    const buyer = sale.customer
      ? { name: sale.customer.name, href: customerHref(sale.customer.id) }
      : { name: sale.dealer?.name ?? "Unknown buyer", href: sale.dealer ? dealerHref(sale.dealer.id) : "#" };
    rows.push({
      id: sale.id,
      date: sale.saleDate,
      side: "CREDIT",
      label: "Sale",
      counterpartyName: buyer.name,
      counterpartyHref: buyer.href,
      detail: `${sale.items.length} item${sale.items.length === 1 ? "" : "s"}`,
      paymentMethod: methods.length === 0 ? null : methods.length > 1 ? "MIXED" : methods[0],
      amount: sale.items.reduce((sum, i) => sum + Number(i.actualPrice) * Number(i.quantity), 0),
      saleId: sale.id,
      deleteRef: { kind: "SALE", dailySaleId: sale.id },
    });
  }

  for (const txn of accountTxns) {
    const customer = txn.customerAccount.customer;
    const base = {
      id: txn.id,
      date: txn.transactionDate,
      counterpartyName: customer.name,
      counterpartyHref: customerHref(customer.id),
      // Udhaar to Shop entries and imported balances carry a reference.
      detail: txn.reference ? `Ref: ${txn.reference}` : null,
      paymentMethod: txn.paymentMethod,
      amount: Number(txn.amount),
      saleId: null,
    };
    const asTxn = { kind: "ACCOUNT_TRANSACTION" as const, transactionId: txn.id };

    if (txn.isShopBorrowed) {
      // This bucket inverts OUT/IN: OUT = the shop borrowed (money in).
      rows.push(
        txn.direction === "OUT"
          ? { ...base, side: "CREDIT", label: "Borrowed from customer", deleteRef: asTxn }
          : { ...base, side: "DEBIT", label: "Repaid to customer", deleteRef: asTxn }
      );
    } else if (txn.linkedGrainBatchId) {
      rows.push({
        ...base,
        side: "DEBIT",
        label: "Grain bought from customer",
        deleteRef: { kind: "GRAIN_SETTLEMENT", transactionId: txn.id },
      });
    } else if (txn.direction === "IN" && txn.quantity !== null) {
      // payGrainDebt: the shop paying a customer for grain (money out),
      // despite being posted with direction IN. Only rows carrying the
      // product link are safe for deleteAccountTransaction to reverse.
      rows.push({
        ...base,
        side: "DEBIT",
        label: "Paid customer for grain",
        deleteRef: txn.linkedProductId ? asTxn : null,
      });
    } else if (txn.direction === "IN") {
      rows.push({ ...base, side: "CREDIT", label: "Udhaar received", deleteRef: asTxn });
    } else {
      const label = txn.notes?.startsWith("Imported from register")
        ? "Udhaar imported"
        : txn.isLongTerm
          ? "Long-term loan given"
          : "Udhaar given";
      rows.push({ ...base, side: "DEBIT", label, deleteRef: asTxn });
    }
  }

  for (const payment of grainCreditPayments) {
    const sale = payment.dailySaleItem.dailySale;
    rows.push({
      id: payment.id,
      date: payment.paidAt,
      side: "CREDIT",
      label: "Grain Udhaar received",
      counterpartyName: sale.customer?.name ?? sale.dealer?.name ?? "Unknown buyer",
      counterpartyHref: sale.customer ? customerHref(sale.customer.id) : sale.dealer ? dealerHref(sale.dealer.id) : "#",
      detail: payment.dailySaleItem.product.name,
      paymentMethod: payment.paymentMethod,
      amount: Number(payment.amount),
      saleId: null,
      deleteRef: { kind: "GRAIN_CREDIT_PAYMENT", paymentId: payment.id },
    });
  }

  for (const expense of expenses) {
    const monthly = expense.expenseType === "MONTHLY";
    rows.push({
      id: expense.id,
      date: expense.expenseDate,
      side: "DEBIT",
      label: monthly ? "Monthly expense" : "Daily expense",
      counterpartyName: expense.monthlyExpenseType?.name ?? expense.description,
      counterpartyHref: monthly ? "/dashboard/expenses?tab=monthly" : "/dashboard/expenses",
      detail: null,
      paymentMethod: expense.paymentMethod,
      amount: Number(expense.amount),
      saleId: null,
      deleteRef: { kind: "EXPENSE", expenseId: expense.id },
    });
  }

  for (const payment of expensePayments) {
    rows.push({
      id: payment.id,
      date: payment.paidAt,
      side: "DEBIT",
      label: "Expense Udhaar paid",
      counterpartyName: payment.expense.description,
      counterpartyHref: "/dashboard/expenses",
      detail: null,
      paymentMethod: payment.paymentMethod,
      amount: Number(payment.amount),
      saleId: null,
      deleteRef: { kind: "EXPENSE_PAYMENT", paymentId: payment.id },
    });
  }

  for (const purchase of dealerPurchases) {
    rows.push({
      id: purchase.id,
      date: purchase.purchaseDate,
      side: "DEBIT",
      label: "Bought from dealer",
      counterpartyName: purchase.dealer.name,
      counterpartyHref: dealerHref(purchase.dealer.id),
      detail: `${Number(purchase.quantity)} ${purchase.product.name}`,
      paymentMethod: purchase.paymentMethod,
      amount: Number(purchase.quantity) * Number(purchase.costPrice),
      saleId: null,
      deleteRef: { kind: "DEALER_PURCHASE", purchaseId: purchase.id },
    });
  }

  for (const txn of dealerTxns) {
    const dealer = txn.dealerAccount.dealer;
    const base = {
      id: txn.id,
      date: txn.transactionDate,
      side: "DEBIT" as const,
      counterpartyName: dealer.name,
      counterpartyHref: dealerHref(dealer.id),
      paymentMethod: txn.paymentMethod,
      amount: Number(txn.amount),
      saleId: null,
    };
    const refDetail = txn.reference ? `Ref: ${txn.reference}` : null;
    if (txn.isDealerSale) {
      rows.push(
        txn.direction === "OUT"
          ? {
              ...base,
              side: "CREDIT",
              label: "Received from dealer",
              detail: null,
              deleteRef: { kind: "DEALER_TRANSACTION", transactionId: txn.id },
            }
          : {
              ...base,
              label: "Dealer Udhaar imported",
              detail: refDetail,
              deleteRef: { kind: "DEALER_TRANSACTION", transactionId: txn.id },
            }
      );
    } else if (txn.direction === "IN") {
      rows.push({
        ...base,
        label: "Paid dealer",
        detail: null,
        deleteRef: { kind: "DEALER_TRANSACTION", transactionId: txn.id },
      });
    } else if (txn.isSettledPurchase || txn.notes?.startsWith("Purchased ")) {
      // A grain purchase's own payment row (createDealerGrainPurchase
      // writes no separate purchase record). No safe reversal exists
      // for these yet — deleting this row alone would leave the grain
      // batch and stock behind.
      rows.push({ ...base, label: "Grain bought from dealer", detail: txn.notes, deleteRef: null });
    } else {
      rows.push({
        ...base,
        label: txn.notes?.startsWith("Imported from register") ? "Dealer Udhaar imported" : "Dealer Udhaar recorded",
        detail: refDetail ?? txn.notes,
        deleteRef: { kind: "DEALER_TRANSACTION", transactionId: txn.id },
      });
    }
  }

  const search = options?.search?.trim().toLowerCase();
  const filtered = search
    ? rows.filter(
        (r) => r.counterpartyName.toLowerCase().includes(search) || (r.detail ?? "").toLowerCase().includes(search)
      )
    : rows;
  filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

  const credit = filtered.filter((r) => r.side === "CREDIT");
  const debit = filtered.filter((r) => r.side === "DEBIT");
  const sum = (list: LedgerRow[]) => list.reduce((s, r) => s + r.amount, 0);

  return { fromDate, toDate, credit, debit, creditTotal: sum(credit), debitTotal: sum(debit) };
}
