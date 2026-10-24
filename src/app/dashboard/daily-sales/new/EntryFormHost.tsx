"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DealerProductPurchaseForm } from "@/modules/dealers/components/RecordDealerProductPurchaseModal";
import { DealerGrainPurchaseForm } from "@/modules/dealers/components/RecordDealerGrainPurchaseModal";
import { ExpenseForm } from "@/modules/expenses/components/ExpenseForm";
import { MonthlyExpenseForm } from "@/modules/expenses/components/MonthlyExpenseForm";
import { LongTermLoanForm } from "@/modules/customers/components/LongTermLoanModal";
import { ShopBorrowedLoanForm } from "@/modules/customers/components/ShopBorrowedLoanModal";
import { PayDealerPanel } from "./PayDealerPanel";
import { ImportUdhaarPanel } from "./ImportUdhaarPanel";
import { buildNewSaleHref } from "./searchParamsHref";
import type { listDealers, getDealerBalances } from "@/modules/dealers/actions";
import type { listProducts } from "@/modules/products/actions";
import type { listMonthlyExpenseTypes } from "@/modules/expenses/actions";
import type { listAreas } from "@/modules/settings/areas.actions";

type BankAccounts = { id: string; name: string }[];
type Dealers = Awaited<ReturnType<typeof listDealers>>;
type Products = Awaited<ReturnType<typeof listProducts>>["products"];

export type HostedEntry =
  | { tab: "dealer-products"; dealers: Dealers; products: Products; bankAccounts: BankAccounts }
  | { tab: "dealer-grain"; dealers: Dealers; products: Products; bankAccounts: BankAccounts }
  | { tab: "pay-dealer"; dealers: Awaited<ReturnType<typeof getDealerBalances>>; bankAccounts: BankAccounts }
  | { tab: "daily-expense"; bankAccounts: BankAccounts }
  | { tab: "monthly-expense"; types: Awaited<ReturnType<typeof listMonthlyExpenseTypes>>; bankAccounts: BankAccounts }
  | { tab: "long-term-loan"; bankAccounts: BankAccounts }
  | { tab: "borrow-from-customer"; areas: Awaited<ReturnType<typeof listAreas>>; bankAccounts: BankAccounts }
  | { tab: "import-udhaar" };

// Renders the chosen entry's form on the New entry screen. A save
// refreshes server data (balances, stock) and remounts the form empty,
// ready for the next entry; Cancel goes back to the option grid.
export function EntryFormHost({ entry }: { entry: HostedEntry }) {
  const router = useRouter();
  const [round, setRound] = useState(0);

  function onSaved() {
    setRound((r) => r + 1);
    router.refresh();
  }

  function onCancel() {
    router.push(buildNewSaleHref({}));
  }

  const common = { onSaved, onCancel };

  switch (entry.tab) {
    case "dealer-products":
      return (
        <DealerProductPurchaseForm
          key={round}
          {...common}
          dealers={entry.dealers}
          products={entry.products}
          bankAccounts={entry.bankAccounts}
        />
      );
    case "dealer-grain":
      return (
        <DealerGrainPurchaseForm
          key={round}
          {...common}
          dealers={entry.dealers}
          products={entry.products}
          bankAccounts={entry.bankAccounts}
        />
      );
    case "pay-dealer":
      return <PayDealerPanel key={round} {...common} dealers={entry.dealers} bankAccounts={entry.bankAccounts} />;
    case "daily-expense":
      return <ExpenseForm key={round} {...common} bankAccounts={entry.bankAccounts} />;
    case "monthly-expense":
      return <MonthlyExpenseForm key={round} {...common} types={entry.types} bankAccounts={entry.bankAccounts} />;
    case "long-term-loan":
      return <LongTermLoanForm key={round} {...common} bankAccounts={entry.bankAccounts} />;
    case "borrow-from-customer":
      return <ShopBorrowedLoanForm key={round} {...common} areas={entry.areas} bankAccounts={entry.bankAccounts} />;
    case "import-udhaar":
      return <ImportUdhaarPanel key={round} {...common} />;
  }
}
