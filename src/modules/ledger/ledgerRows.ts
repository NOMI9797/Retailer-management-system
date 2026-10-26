import { db } from "@/lib/db";
import type { BankAccountRowDeleteRef } from "@/modules/settings/bankAccounts.actions";

// Every record that moves money (or grain) in the shop, gathered into
// one row shape — the single source behind the Daily sales page's
// Credit/Debit records AND the Cash flow page's totals, so the two can
// never disagree. Not a "use server" module: it takes a shopId, so only
// server code that has already resolved the shop (getCurrentShopId)
// may call it.

export type LedgerCategory = "SALES" | "UDHAAR" | "LOANS" | "DEALERS" | "EXPENSES" | "GRAIN";

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
  // Set on sale rows only — sales keep their own Edit/Delete, for this
  // one visit (a customer's same-day visits share one DailySale).
  saleId: string | null;
  visitAt?: Date;
  // Grain-only entries (a drop-off kept for later, own stock added, a
  // grain loan or grain given back) move no money: amount is 0 and the
  // quantity is in detail. They sit on the side the grain moves —
  // Credit when it comes in, Debit when it goes out.
  stockOnly?: boolean;
  // How the money was paid when a row mixes methods (a sale paid part
  // cash, part bank, part Udhaar). Absent means all of amount went by
  // paymentMethod.
  splits?: { method: "CASH" | "ACCOUNT" | "CREDIT"; amount: number }[];
  // What kind of entry this is, for Cash flow's breakdown (set from the
  // label — see categoryOf).
  category?: LedgerCategory;
  // Which existing reversal deletes this row (see deleteBankAccountRow).
  // Null where the app has no safe reversal yet (dealer grain purchases).
  deleteRef: BankAccountRowDeleteRef | null;
};

const customerHref = (id: string) => `/dashboard/customers/${id}`;
const dealerHref = (id: string) => `/dashboard/dealers/${id}`;

// Which Cash flow breakdown line an entry belongs to, by its label.
export function categoryOf(label: string): LedgerCategory {
  if (label === "Sale") return "SALES";
  if (label.includes("dealer") || label.startsWith("Dealer")) return "DEALERS";
  if (label.startsWith("Grain") || label.includes("grain") || label === "Own stock added") return "GRAIN";
  if (label.includes("expense") || label.startsWith("Expense")) return "EXPENSES";
  if (label.includes("loan") || label.includes("Borrowed") || label.includes("Repaid")) return "LOANS";
  return "UDHAAR";
}

// Every row for the shop in a date range (inclusive Date bounds).
// customerId / areaId / accountTypeId narrow to customer-linked rows
// (rows with no customer behind them are then left out).
export async function collectLedgerRows(
  shopId: string,
  range: { gte: Date; lte: Date },
  options?: { customerId?: string; areaId?: string; accountTypeId?: string }
): Promise<LedgerRow[]> {
  const customerScoped = !!(options?.customerId || options?.areaId || options?.accountTypeId);
  const customerMatch = {
    shopId,
    id: options?.customerId || undefined,
    areaId: options?.areaId || undefined,
    accounts: options?.accountTypeId ? { some: { accountTypeId: options.accountTypeId } } : undefined,
  };
  const none = Promise.resolve([] as never[]);

  const [sales, accountTxns, grainCreditPayments, expenses, expensePayments, dealerPurchases, dealerTxns, loanReturns] =
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
        include: {
          customerAccount: { include: { customer: true } },
          linkedGrainBatch: { include: { product: { include: { unit: true } } } },
        },
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
      // Grain loan returns that paid money for some bags (the grain
      // itself moves no money and isn't listed).
      db.grainLoanReturn.findMany({
        where: {
          shopId,
          returnDate: range,
          amount: { gt: 0 },
          grainLoan: customerScoped ? { customer: customerMatch } : undefined,
        },
        include: { grainLoan: { include: { product: true, customer: true, dealer: true } } },
      }),
    ]);

  const rows: LedgerRow[] = [];

  for (const sale of sales) {
    const buyer = sale.customer
      ? { name: sale.customer.name, href: customerHref(sale.customer.id) }
      : { name: sale.dealer?.name ?? "Unknown buyer", href: sale.dealer ? dealerHref(sale.dealer.id) : "#" };
    // One row per visit (receipt): a customer's same-day visits share
    // one DailySale, but each is its own sale to edit or delete.
    const visitTimes = Array.from(new Set(sale.items.map((i) => i.visitAt.getTime()))).sort((a, b) => a - b);
    for (const time of visitTimes) {
      const items = sale.items.filter((i) => i.visitAt.getTime() === time);
      // Payments from before per-visit tracking have no visitAt; they
      // belong to the sale's only visit.
      const payments = sale.payments.filter((p) =>
        p.visitAt ? p.visitAt.getTime() === time : visitTimes.length === 1
      );
      const methods = Array.from(new Set(payments.map((p) => p.paymentMethod)));
      rows.push({
        id: `${sale.id}:${time}`,
        date: new Date(time),
        side: "CREDIT",
        label: "Sale",
        counterpartyName: buyer.name,
        counterpartyHref: buyer.href,
        detail: `${items.length} item${items.length === 1 ? "" : "s"}`,
        paymentMethod: methods.length === 0 ? null : methods.length > 1 ? "MIXED" : methods[0],
        amount: items.reduce((sum, i) => sum + Number(i.actualPrice) * Number(i.quantity), 0),
        splits: payments.map((p) => ({ method: p.paymentMethod, amount: Number(p.amount) })),
        saleId: sale.id,
        visitAt: new Date(time),
        deleteRef: { kind: "SALE", dailySaleId: sale.id, visitAt: new Date(time) },
      });
    }
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
      const batch = txn.linkedGrainBatch;
      rows.push({
        ...base,
        side: "DEBIT",
        label: "Grain bought from customer",
        // What was bought, e.g. "20 Kgs Cotton @ 80 · Ref: 12".
        detail: batch
          ? [
              `${Number(txn.quantity ?? batch.quantityIn)} ${batch.product.unit.name} ${batch.product.name} @ ${Number(batch.rate ?? 0)}`,
              base.detail,
            ]
              .filter(Boolean)
              .join(" · ")
          : base.detail,
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
      detail: payment.reference ? `Ref: ${payment.reference}` : null,
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
              detail: refDetail,
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
        detail: refDetail,
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

  for (const ret of loanReturns) {
    const loan = ret.grainLoan;
    const lent = loan.direction === "SHOP_LENT";
    rows.push({
      id: ret.id,
      date: ret.returnDate,
      // Paid for lent bags = money in; paying for borrowed bags = out.
      side: lent ? "CREDIT" : "DEBIT",
      label: lent ? "Grain loan — paid to shop" : "Grain loan — paid by shop",
      counterpartyName: loan.customer?.name ?? loan.dealer?.name ?? "Unknown",
      counterpartyHref: loan.customer ? customerHref(loan.customer.id) : loan.dealer ? dealerHref(loan.dealer.id) : "#",
      detail: `${Number(ret.quantityPaid)} ${loan.product.name}${ret.reference ? ` · Ref: ${ret.reference}` : ""}`,
      paymentMethod: ret.paymentMethod,
      amount: Number(ret.amount),
      saleId: null,
      deleteRef: { kind: "GRAIN_LOAN_RETURN", returnId: ret.id },
    });
  }

  // Grain-only entries — no money moves, so they add 0 to the totals.
  const [deposits, ownBatches, grainLoans, grainReturns] = await Promise.all([
    // A customer's drop-off kept for later (settle-now drop-offs create
    // no customer batch — they're already "Grain bought from customer").
    db.grainBatch.findMany({
      where: {
        receivedAt: range,
        product: { shopId },
        ownerCustomerId: { not: null },
        ownerCustomer: customerScoped ? customerMatch : undefined,
      },
      include: { product: { include: { unit: true } }, ownerCustomer: true },
    }),
    // Own stock added with Add batch: a shop batch that came from no
    // dealer, customer purchase or grain loan (those have their own rows).
    customerScoped
      ? none
      : db.grainBatch.findMany({
          where: {
            receivedAt: range,
            product: { shopId },
            ownerCustomerId: null,
            dealerId: null,
            sourceBatchId: null,
            grainLoanId: null,
            grainLoanReturnId: null,
            paymentTransactions: { none: {} },
          },
          include: { product: { include: { unit: true } } },
        }),
    db.grainLoan.findMany({
      where: { shopId, loanDate: range, ...(customerScoped ? { customer: customerMatch } : {}) },
      include: { product: { include: { unit: true } }, customer: true, dealer: true },
    }),
    db.grainLoanReturn.findMany({
      where: {
        shopId,
        returnDate: range,
        quantityReturned: { gt: 0 },
        grainLoan: customerScoped ? { customer: customerMatch } : undefined,
      },
      include: { grainLoan: { include: { product: { include: { unit: true } }, customer: true, dealer: true } } },
    }),
  ]);
  const grainRow = { paymentMethod: null, amount: 0, saleId: null, stockOnly: true } as const;
  const qty = (n: unknown, unit: string, product: string) => `${Number(n)} ${unit} ${product}`;

  for (const b of deposits) {
    rows.push({
      ...grainRow,
      id: `dep:${b.id}`,
      date: b.receivedAt,
      side: "CREDIT",
      label: "Grain kept (drop-off)",
      counterpartyName: b.ownerCustomer!.name,
      counterpartyHref: customerHref(b.ownerCustomer!.id),
      detail: qty(b.quantityIn, b.product.unit.name, b.product.name),
      deleteRef: { kind: "GRAIN_DEPOSIT", batchId: b.id },
    });
  }
  for (const b of ownBatches) {
    rows.push({
      ...grainRow,
      id: `own:${b.id}`,
      date: b.receivedAt,
      side: "CREDIT",
      label: "Own stock added",
      counterpartyName: "Own stock",
      counterpartyHref: `/dashboard/grain?product=${b.productId}`,
      detail: `${qty(b.quantityIn, b.product.unit.name, b.product.name)} @ ${Number(b.rate ?? 0)}`,
      deleteRef: null,
    });
  }
  for (const loan of grainLoans) {
    const lent = loan.direction === "SHOP_LENT";
    rows.push({
      ...grainRow,
      id: `loan:${loan.id}`,
      date: loan.loanDate,
      side: lent ? "DEBIT" : "CREDIT",
      label: lent ? "Grain lent" : "Grain borrowed",
      counterpartyName: loan.customer?.name ?? loan.dealer?.name ?? "Unknown",
      counterpartyHref: loan.customer ? customerHref(loan.customer.id) : loan.dealer ? dealerHref(loan.dealer.id) : "#",
      detail: `${qty(loan.quantity, loan.product.unit.name, loan.product.name)} · Ref: ${loan.reference}`,
      deleteRef: { kind: "GRAIN_LOAN", loanId: loan.id },
    });
  }
  for (const ret of grainReturns) {
    const loan = ret.grainLoan;
    const lent = loan.direction === "SHOP_LENT";
    rows.push({
      ...grainRow,
      id: `ret:${ret.id}`,
      date: ret.returnDate,
      // Lent grain coming back = in; the shop giving borrowed grain back = out.
      side: lent ? "CREDIT" : "DEBIT",
      label: lent ? "Grain loan returned" : "Borrowed grain given back",
      counterpartyName: loan.customer?.name ?? loan.dealer?.name ?? "Unknown",
      counterpartyHref: loan.customer ? customerHref(loan.customer.id) : loan.dealer ? dealerHref(loan.dealer.id) : "#",
      detail: `${qty(ret.quantityReturned, loan.product.unit.name, loan.product.name)}${ret.reference ? ` · Ref: ${ret.reference}` : ""}`,
      deleteRef: { kind: "GRAIN_LOAN_RETURN", returnId: ret.id },
    });
  }

  return rows.map((r) => ({ ...r, category: categoryOf(r.label) }));
}
