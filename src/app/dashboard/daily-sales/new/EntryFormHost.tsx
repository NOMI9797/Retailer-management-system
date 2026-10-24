"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DealerProductPurchaseForm } from "@/modules/dealers/components/RecordDealerProductPurchaseModal";
import { DealerGrainPurchaseForm } from "@/modules/dealers/components/RecordDealerGrainPurchaseModal";
import { ExpenseForm } from "@/modules/expenses/components/ExpenseForm";
import { MonthlyExpenseForm } from "@/modules/expenses/components/MonthlyExpenseForm";
import { LongTermLoanForm } from "@/modules/customers/components/LongTermLoanModal";
import { ShopBorrowedLoanForm } from "@/modules/customers/components/ShopBorrowedLoanModal";
import { GrainLoanForm } from "@/modules/grain-loans/components/GrainLoanModal";
import { GrainBatchForm } from "@/modules/products/components/GrainBatchForm";
import { PayDealerPanel } from "./PayDealerPanel";
import { ReceiveDealerPanel } from "./ReceiveDealerPanel";
import { ImportUdhaarPanel } from "./ImportUdhaarPanel";
import { buildNewSaleHref } from "./searchParamsHref";
import type { listDealers, listDealerUdhaarSides } from "@/modules/dealers/actions";
import type { listProducts } from "@/modules/products/actions";
import type { listMonthlyExpenseTypes } from "@/modules/expenses/actions";
import type { listAreas } from "@/modules/settings/areas.actions";

type BankAccounts = { id: string; name: string }[];
type Dealers = Awaited<ReturnType<typeof listDealers>>;
type DealerSides = Awaited<ReturnType<typeof listDealerUdhaarSides>>;
type Products = Awaited<ReturnType<typeof listProducts>>["products"];
type Areas = Awaited<ReturnType<typeof listAreas>>;
// The person picked first on the New entry screen, if any — each form
// opens with them already selected.
type Person = { customer?: { id: string; name: string }; dealerId?: string };

export type HostedEntry = Person &
  (
    | { tab: "dealer-products"; dealers: Dealers; products: Products; bankAccounts: BankAccounts }
    | { tab: "dealer-grain"; dealers: Dealers; products: Products; bankAccounts: BankAccounts }
    | { tab: "pay-dealer"; dealers: DealerSides; bankAccounts: BankAccounts }
    | { tab: "receive-dealer"; dealers: DealerSides; bankAccounts: BankAccounts }
    | { tab: "daily-expense"; bankAccounts: BankAccounts }
    | { tab: "monthly-expense"; types: Awaited<ReturnType<typeof listMonthlyExpenseTypes>>; bankAccounts: BankAccounts }
    | { tab: "long-term-loan"; bankAccounts: BankAccounts }
    | { tab: "borrow-from-customer"; areas: Areas; bankAccounts: BankAccounts }
    | { tab: "import-udhaar" }
    | {
        tab: "grain-loan";
        products: { id: string; name: string }[];
        areas: Areas;
        dealers: { id: string; name: string }[];
        dealerName?: string;
      }
    | { tab: "add-batch"; products: { id: string; name: string }[]; areas: Areas; bankAccounts: BankAccounts }
  );

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
          defaultDealerId={entry.dealerId}
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
          defaultDealerId={entry.dealerId}
        />
      );
    case "pay-dealer":
      return (
        <PayDealerPanel
          key={round}
          {...common}
          dealers={entry.dealers}
          bankAccounts={entry.bankAccounts}
          initialDealerId={entry.dealerId}
        />
      );
    case "receive-dealer":
      return (
        <ReceiveDealerPanel
          key={round}
          {...common}
          dealers={entry.dealers}
          bankAccounts={entry.bankAccounts}
          initialDealerId={entry.dealerId}
        />
      );
    case "daily-expense":
      return <ExpenseForm key={round} {...common} bankAccounts={entry.bankAccounts} />;
    case "monthly-expense":
      return <MonthlyExpenseForm key={round} {...common} types={entry.types} bankAccounts={entry.bankAccounts} />;
    case "long-term-loan":
      return (
        <LongTermLoanForm
          key={round}
          {...common}
          bankAccounts={entry.bankAccounts}
          initialCustomer={entry.customer}
        />
      );
    case "borrow-from-customer":
      return (
        <ShopBorrowedLoanForm
          key={round}
          {...common}
          areas={entry.areas}
          bankAccounts={entry.bankAccounts}
          initialCustomer={entry.customer}
        />
      );
    case "import-udhaar":
      return <ImportUdhaarPanel key={round} {...common} initialCustomer={entry.customer} />;
    case "grain-loan":
      return (
        <GrainLoanForm
          key={round}
          {...common}
          products={entry.products}
          areas={entry.areas}
          dealers={entry.dealers}
          fixedParty={
            entry.customer
              ? { kind: "CUSTOMER", ...entry.customer }
              : entry.dealerId
                ? { kind: "DEALER", id: entry.dealerId, name: entry.dealerName ?? "" }
                : undefined
          }
        />
      );
    case "add-batch":
      return <AddBatchPanel key={round} {...common} entry={entry} />;
  }
}

// Add batch (own stock or a customer's drop-off) for a grain picked
// here — the Grain page's Add batch, without having to open that page.
function AddBatchPanel({
  entry,
  onSaved,
}: {
  entry: Extract<HostedEntry, { tab: "add-batch" }>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [productId, setProductId] = useState(entry.products[0]?.id ?? "");

  if (entry.products.length === 0) {
    return <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>No grain products yet — add one in Settings.</p>;
  }

  return (
    <>
      <div className="field">
        <label>Grain</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          {entry.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <GrainBatchForm
        key={productId}
        productId={productId}
        forCustomerId={entry.customer?.id}
        areas={entry.areas}
        bankAccounts={entry.bankAccounts}
        onSaved={onSaved}
      />
    </>
  );
}
