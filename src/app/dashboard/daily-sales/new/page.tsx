import { Suspense } from "react";
import Link from "next/link";
import { listProducts } from "@/modules/products/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { listDealers, getDealerBalances } from "@/modules/dealers/actions";
import { listMonthlyExpenseTypes } from "@/modules/expenses/actions";
import { NewSaleForm } from "@/modules/daily-sales/components/NewSaleForm";
import { UdhaarClearanceForm } from "@/modules/daily-sales/components/UdhaarClearanceForm";
import { StockFromCustomerForm } from "@/modules/daily-sales/components/StockFromCustomerForm";
import { PageLoader } from "@/components/shared/PageLoader";
import { EntryFormHost } from "./EntryFormHost";
import { buildNewSaleHref, type NewSalePageSearchParams } from "./searchParamsHref";

// Every kind of entry the app can record, split the way the Daily
// sales page reads: Credit (money in) and Debit (money out), each with
// its own groups. The one place a new entry type gets added: its card,
// heading and URL key all come from here.
const ENTRY_SIDES = [
  {
    side: "credit",
    title: "Credit",
    subtitle: "Money coming in",
    groups: [
      {
        title: "Sales & receipts",
        entries: [
          { tab: "new-sale", title: "New sale", description: "Sell products or grain to a customer or dealer." },
          {
            tab: "udhaar-clearance",
            title: "Receive Udhaar",
            description: "A customer pays back Udhaar, a loan or grain Udhaar.",
          },
        ],
      },
      {
        title: "Loans",
        entries: [
          {
            tab: "borrow-from-customer",
            title: "Borrow from customer",
            description: "Cash the shop takes from a customer, to repay later.",
          },
        ],
      },
    ],
  },
  {
    side: "debit",
    title: "Debit",
    subtitle: "Money going out",
    groups: [
      {
        title: "Udhaar & stock",
        entries: [
          {
            tab: "pay-shop-udhaar",
            title: "Pay back shop's Udhaar",
            description: "Repay money borrowed, grain owed, or expense Udhaar.",
          },
          {
            tab: "stock-from-customer",
            title: "Buy/Keep stock",
            description: "Record a customer's grain drop-off, or buy their stored grain.",
          },
        ],
      },
      {
        title: "Purchases from dealers",
        entries: [
          {
            tab: "dealer-products",
            title: "Buy products from dealer",
            description: "Bulk stock bought from a products dealer.",
          },
          { tab: "dealer-grain", title: "Buy grain from dealer", description: "Bulk grain bought from a grain dealer." },
          { tab: "pay-dealer", title: "Pay a dealer", description: "Pay down what the shop owes a dealer." },
        ],
      },
      {
        title: "Expenses",
        entries: [
          { tab: "daily-expense", title: "Daily expense", description: "Fuel, wages, repairs or any day-to-day cost." },
          { tab: "monthly-expense", title: "Monthly expense", description: "A recurring cost such as rent or a salary." },
        ],
      },
      {
        title: "Loans & Udhaar",
        entries: [
          { tab: "long-term-loan", title: "Give long-term loan", description: "Lend cash to a customer for a fixed term." },
          { tab: "import-udhaar", title: "Import old Udhaar", description: "Bring a balance over from the paper register." },
        ],
      },
    ],
  },
] as const;

type Entry = (typeof ENTRY_SIDES)[number]["groups"][number]["entries"][number];
type EntryTab = Entry["tab"];
const ENTRIES: readonly Entry[] = ENTRY_SIDES.flatMap((side) =>
  side.groups.flatMap((group): readonly Entry[] => group.entries)
);

// The New sale button lands here: with no ?tab it shows every entry
// type as a card; with one it shows that entry's form inline.
export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<NewSalePageSearchParams>;
}) {
  const { tab } = await searchParams;
  const entry = ENTRIES.find((e) => e.tab === tab);

  if (!entry) {
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>New entry</h1>
            <p>What would you like to record?</p>
          </div>
        </div>

        <div className="ledger-columns">
          {ENTRY_SIDES.map((side) => (
            <section key={side.side} className="panel ledger-column">
              <div className="ledger-column-head">
                <h2 style={{ color: side.side === "credit" ? "var(--primary-600)" : "var(--consigned-600)" }}>
                  {side.title}
                </h2>
                <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--ink-muted)" }}>{side.subtitle}</span>
              </div>
              <div style={{ padding: 16 }}>
                {side.groups.map((group) => (
                  <div key={group.title} className="entry-group">
                    <h3 className="entry-group-title">{group.title}</h3>
                    <div className="entry-grid">
                      {group.entries.map((e) => (
                        <Link key={e.tab} href={buildNewSaleHref({ tab: e.tab })} className="stat-card entry-card">
                          <h3>{e.title}</h3>
                          <p>{e.description}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href={buildNewSaleHref({})} className="back-link">
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        All options
      </Link>

      <div className="page-head" style={{ marginTop: 16 }}>
        <div>
          <h1>{entry.title}</h1>
          <p>{entry.description}</p>
        </div>
      </div>

      <div className="panel" style={{ padding: 32 }}>
        <Suspense key={entry.tab} fallback={<PageLoader label="Loading…" />}>
          <EntryBody tab={entry.tab} />
        </Suspense>
      </div>
    </div>
  );
}

// Loads only what the chosen entry's form needs.
async function EntryBody({ tab }: { tab: EntryTab }) {
  switch (tab) {
    case "new-sale": {
      const [areas, simpleProducts, grainProducts, bankAccounts, dealers] = await Promise.all([
        listAreas(),
        listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
        listProducts({ stockKind: "GRAIN", pageSize: 500 }),
        listBankAccounts(),
        listDealers(),
      ]);
      return (
        <NewSaleForm
          areas={areas}
          products={[...simpleProducts.products, ...grainProducts.products]}
          dealers={dealers}
          bankAccounts={bankAccounts}
        />
      );
    }
    case "udhaar-clearance": {
      const [areas, accountTypes, bankAccounts] = await Promise.all([
        listAreas(),
        listAccountTypes(),
        listBankAccounts(),
      ]);
      return <UdhaarClearanceForm areas={areas} accountTypes={accountTypes} bankAccounts={bankAccounts} />;
    }
    case "pay-shop-udhaar": {
      const [areas, accountTypes, bankAccounts] = await Promise.all([
        listAreas(),
        listAccountTypes(),
        listBankAccounts(),
      ]);
      return (
        <UdhaarClearanceForm
          areas={areas}
          accountTypes={accountTypes}
          bankAccounts={bankAccounts}
          initialTab="shop"
        />
      );
    }
    case "stock-from-customer": {
      const [areas, grainProducts] = await Promise.all([
        listAreas(),
        listProducts({ stockKind: "GRAIN", pageSize: 500 }),
      ]);
      return <StockFromCustomerForm areas={areas} grainProducts={grainProducts.products} />;
    }
    case "dealer-products": {
      const [dealers, products, bankAccounts] = await Promise.all([
        listDealers({ type: "PRODUCTS" }),
        listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
        listBankAccounts(),
      ]);
      return <EntryFormHost entry={{ tab, dealers, products: products.products, bankAccounts }} />;
    }
    case "dealer-grain": {
      const [dealers, products, bankAccounts] = await Promise.all([
        listDealers({ type: "GRAIN" }),
        listProducts({ stockKind: "GRAIN", pageSize: 500 }),
        listBankAccounts(),
      ]);
      return <EntryFormHost entry={{ tab, dealers, products: products.products, bankAccounts }} />;
    }
    case "pay-dealer": {
      const [productDealers, grainDealers, bankAccounts] = await Promise.all([
        getDealerBalances("PRODUCTS"),
        getDealerBalances("GRAIN"),
        listBankAccounts(),
      ]);
      const owed = [...productDealers, ...grainDealers]
        .filter((d) => d.currentBalance > 0.01)
        .sort((a, b) => a.name.localeCompare(b.name));
      return <EntryFormHost entry={{ tab, dealers: owed, bankAccounts }} />;
    }
    case "daily-expense":
      return <EntryFormHost entry={{ tab, bankAccounts: await listBankAccounts() }} />;
    case "monthly-expense": {
      const [types, bankAccounts] = await Promise.all([listMonthlyExpenseTypes(), listBankAccounts()]);
      return <EntryFormHost entry={{ tab, types, bankAccounts }} />;
    }
    case "long-term-loan":
      return <EntryFormHost entry={{ tab, bankAccounts: await listBankAccounts() }} />;
    case "borrow-from-customer": {
      const [areas, bankAccounts] = await Promise.all([listAreas(), listBankAccounts()]);
      return <EntryFormHost entry={{ tab, areas, bankAccounts }} />;
    }
    case "import-udhaar":
      return <EntryFormHost entry={{ tab }} />;
  }
}
