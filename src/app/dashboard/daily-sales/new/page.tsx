import { Suspense } from "react";
import Link from "next/link";
import { listProducts } from "@/modules/products/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { listDealers, listDealerUdhaarSides } from "@/modules/dealers/actions";
import { listMonthlyExpenseTypes } from "@/modules/expenses/actions";
import { getCustomer, getCustomerRelationshipSummary } from "@/modules/customers/actions";
import { listGrainLoans } from "@/modules/grain-loans/actions";
import { NewSaleForm } from "@/modules/daily-sales/components/NewSaleForm";
import { UdhaarClearanceForm } from "@/modules/daily-sales/components/UdhaarClearanceForm";
import { StockFromCustomerForm } from "@/modules/daily-sales/components/StockFromCustomerForm";
import { GrainLoanRecords } from "@/modules/grain-loans/components/GrainLoanRecords";
import { PageLoader } from "@/components/shared/PageLoader";
import { formatMoney } from "@/lib/utils";
import { EntryFormHost } from "./EntryFormHost";
import { EntrySearch } from "./EntrySearch";
import { ENTRIES, ENTRY_SIDES, type EntryDef } from "./entries";
import { buildNewSaleHref, type NewSalePageSearchParams } from "./searchParamsHref";

// The person picked first (search box → ?customer / ?dealer), resolved
// once per request and handed to whichever form opens.
type Person =
  | { kind: "CUSTOMER"; id: string; name: string; phone: string | null }
  | { kind: "DEALER"; id: string; name: string; type: "PRODUCTS" | "GRAIN" };

async function resolvePerson(params: NewSalePageSearchParams): Promise<Person | null> {
  if (params.customer) {
    try {
      const c = await getCustomer(params.customer);
      return { kind: "CUSTOMER", id: c.id, name: c.name, phone: c.phone };
    } catch {
      return null;
    }
  }
  if (params.dealer) {
    const d = (await listDealers()).find((x) => x.id === params.dealer);
    return d ? { kind: "DEALER", id: d.id, name: d.name, type: d.type } : null;
  }
  return null;
}

// The shopkeeper's one place to record anything: a search box ("who
// came, or what happened?") over every entry type as an icon tile,
// Credit (money in) beside Debit (money out). Picking a person shows
// their card — what they owe or are owed, and only the actions that fit
// them — and every form then opens with that person already selected.
// With ?tab, the chosen entry's form shows instead.
export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<NewSalePageSearchParams>;
}) {
  const params = await searchParams;
  const entry = ENTRIES.find((e) => e.tab === params.tab);
  const person = await resolvePerson(params);
  const personParams = person ? (person.kind === "CUSTOMER" ? { customer: person.id } : { dealer: person.id }) : {};

  if (!entry) {
    const dealers = await listDealers();
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>New entry</h1>
            <p>Who came, or what happened? Search, or pick below.</p>
          </div>
        </div>

        <EntrySearch dealers={dealers.map((d) => ({ id: d.id, name: d.name, type: d.type }))} />

        {person && (
          <Suspense key={person.id} fallback={<PageLoader label={`Loading ${person.name}…`} />}>
            <PersonCard person={person} />
          </Suspense>
        )}

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
                        <EntryTile key={e.tab} entry={e} side={side.side} href={buildNewSaleHref({ tab: e.tab, ...personParams })} />
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
      <Link href={buildNewSaleHref(personParams)} className="back-link">
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        All options
      </Link>

      <div className="page-head" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="entry-icon entry-icon-lg">
            <EntryIcon path={entry.icon} />
          </span>
          <div>
            <h1>{entry.title}</h1>
            <p>
              {entry.description}
              {person && (
                <>
                  {" · "}
                  <strong>{person.name}</strong>{" "}
                  <Link href={buildNewSaleHref({ tab: entry.tab })} style={{ fontSize: 12.5 }}>
                    (change)
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 32 }}>
        <Suspense key={`${entry.tab}:${person?.id ?? ""}`} fallback={<PageLoader label="Loading…" />}>
          <EntryBody tab={entry.tab} person={person} />
        </Suspense>
      </div>
    </div>
  );
}

function EntryIcon({ path }: { path: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden>
      <path d={path} />
    </svg>
  );
}

function EntryTile({ entry, side, href, note }: { entry: EntryDef; side: string; href: string; note?: string }) {
  return (
    <Link href={href} className={`stat-card entry-card entry-${side}`}>
      <span className="entry-icon">
        <EntryIcon path={entry.icon} />
      </span>
      <span className="entry-card-text">
        <h3>{entry.title}</h3>
        <p>{note ?? entry.description}</p>
      </span>
    </Link>
  );
}

// The picked person's card: what they owe the shop and what the shop
// owes them (money and grain), then only the actions that fit them,
// each opening with this person already selected.
async function PersonCard({ person }: { person: Person }) {
  const loans = await listGrainLoans(person.kind === "CUSTOMER" ? { customerId: person.id } : { dealerId: person.id });
  const openLoans = loans.filter((l) => l.outstanding > 0);
  const grainOwed = (direction: "SHOP_LENT" | "SHOP_BORROWED") =>
    openLoans
      .filter((l) => l.direction === direction)
      .map((l) => `${l.productName} ${l.outstanding} ${l.unitName}`)
      .join(", ");

  const byTab = (tab: string) => ENTRIES.find((e) => e.tab === tab)!;
  const personParams = person.kind === "CUSTOMER" ? { customer: person.id } : { dealer: person.id };
  const tiles: { tab: string; side: string; note?: string }[] = [];
  let theyOwe = 0;
  let shopOwes = 0;
  let profileHref: string;

  if (person.kind === "CUSTOMER") {
    const summary = await getCustomerRelationshipSummary(person.id);
    theyOwe = summary.customerOwesShop;
    shopOwes = summary.shopOwesCustomer;
    profileHref = `/dashboard/customers/${person.id}`;
    tiles.push({ tab: "new-sale", side: "credit" });
    if (theyOwe > 0.01) tiles.push({ tab: "udhaar-clearance", side: "credit", note: `Owes ${formatMoney(theyOwe)}` });
    if (shopOwes > 0.01) tiles.push({ tab: "pay-shop-udhaar", side: "debit", note: `Shop owes ${formatMoney(shopOwes)}` });
    tiles.push({ tab: "stock-from-customer", side: "debit" });
    tiles.push({ tab: "grain-loan", side: "credit" });
    if (openLoans.length > 0) tiles.push({ tab: "grain-loan-return", side: "credit", note: `${openLoans.length} open` });
    tiles.push({ tab: "borrow-from-customer", side: "credit" });
    tiles.push({ tab: "long-term-loan", side: "debit" });
    tiles.push({ tab: "import-udhaar", side: "debit" });
  } else {
    const sides = (await listDealerUdhaarSides()).find((d) => d.id === person.id);
    theyOwe = sides?.dealerOwes ?? 0;
    shopOwes = sides?.shopOwes ?? 0;
    profileHref = `/dashboard/dealers/${person.id}`;
    tiles.push({ tab: "new-sale", side: "credit" });
    tiles.push({ tab: person.type === "GRAIN" ? "dealer-grain" : "dealer-products", side: "debit" });
    if (shopOwes > 0.01) tiles.push({ tab: "pay-dealer", side: "debit", note: `Shop owes ${formatMoney(shopOwes)}` });
    if (theyOwe > 0.01) tiles.push({ tab: "receive-dealer", side: "credit", note: `Owes ${formatMoney(theyOwe)}` });
    if (person.type === "GRAIN") tiles.push({ tab: "grain-loan", side: "credit" });
    if (openLoans.length > 0) tiles.push({ tab: "grain-loan-return", side: "credit", note: `${openLoans.length} open` });
  }

  const lent = grainOwed("SHOP_LENT");
  const borrowed = grainOwed("SHOP_BORROWED");

  return (
    <section className="panel person-card">
      <div className="person-card-head">
        <div className="cust-avatar-lg">{person.name.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h2>{person.name}</h2>
          <p>
            {person.kind === "CUSTOMER"
              ? `Customer${person.phone ? ` · ${person.phone}` : ""}`
              : person.type === "GRAIN"
                ? "Grain dealer"
                : "Products dealer"}
          </p>
        </div>
        <Link href={profileHref} className="btn btn-ghost">
          Open profile
        </Link>
        <Link href={buildNewSaleHref({})} className="btn btn-ghost" title="Clear">
          ✕
        </Link>
      </div>

      {/* Each balance carries the action that settles it, right there. */}
      <div className="stat-grid" style={{ margin: "0 16px 14px" }}>
        <div className="stat-card">
          <p className="stat-label">Owes the shop</p>
          <p className={`stat-value${theyOwe > 0.01 ? " tone-consigned" : ""}`}>{formatMoney(theyOwe)}</p>
          {theyOwe > 0.01 && (
            <Link
              href={buildNewSaleHref({
                tab: person.kind === "CUSTOMER" ? "udhaar-clearance" : "receive-dealer",
                ...personParams,
              })}
              className="btn btn-primary stat-card-action"
            >
              Receive payment
            </Link>
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">Shop owes them</p>
          <p className={`stat-value${shopOwes > 0.01 ? " tone-consigned" : ""}`}>{formatMoney(shopOwes)}</p>
          {shopOwes > 0.01 && (
            <Link
              href={buildNewSaleHref({
                tab: person.kind === "CUSTOMER" ? "pay-shop-udhaar" : "pay-dealer",
                ...personParams,
              })}
              className="btn btn-primary stat-card-action"
            >
              Pay now
            </Link>
          )}
        </div>
        {(lent || borrowed) && (
          <div className="stat-card">
            <p className="stat-label">Grain loans</p>
            <p className="stat-value tone-grain" style={{ fontSize: 15 }}>
              {lent && <span style={{ display: "block" }}>Owes shop: {lent}</span>}
              {borrowed && <span style={{ display: "block" }}>Shop owes: {borrowed}</span>}
            </p>
            <Link
              href={buildNewSaleHref({ tab: "grain-loan-return", ...personParams })}
              className="btn btn-primary stat-card-action"
            >
              Record return
            </Link>
          </div>
        )}
      </div>

      <div className="entry-grid" style={{ padding: "0 16px 16px" }}>
        {tiles.map((t) => (
          <EntryTile
            key={t.tab}
            entry={byTab(t.tab)}
            side={t.side}
            note={t.note}
            href={buildNewSaleHref({ tab: t.tab, ...personParams })}
          />
        ))}
      </div>
    </section>
  );
}

// Loads only what the chosen entry's form needs, with the picked person
// (if any) passed in so the form opens with them selected.
async function EntryBody({ tab, person }: { tab: string; person: Person | null }) {
  const customer = person?.kind === "CUSTOMER" ? { id: person.id, name: person.name } : undefined;
  const dealerId = person?.kind === "DEALER" ? person.id : undefined;
  const pick = { customer, dealerId };

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
          initialCustomer={customer}
          initialDealerId={dealerId}
        />
      );
    }
    case "udhaar-clearance":
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
          initialTab={tab === "pay-shop-udhaar" ? "shop" : "customer"}
          initialCustomer={customer}
        />
      );
    }
    case "stock-from-customer": {
      const [areas, grainProducts, bankAccounts] = await Promise.all([
        listAreas(),
        listProducts({ stockKind: "GRAIN", pageSize: 500 }),
        listBankAccounts(),
      ]);
      return (
        <StockFromCustomerForm
          areas={areas}
          grainProducts={grainProducts.products}
          initialCustomer={customer}
          bankAccounts={bankAccounts}
        />
      );
    }
    case "grain-loan-return": {
      const [loans, bankAccounts] = await Promise.all([
        listGrainLoans(customer ? { customerId: customer.id } : dealerId ? { dealerId } : {}),
        listBankAccounts(),
      ]);
      const open = loans.filter((l) => l.outstanding > 0);
      return (
        <>
          <p style={{ margin: "0 0 12px", color: "var(--ink-muted)", fontSize: 13.5 }}>
            Open grain loans — press <strong>Record return</strong> on the one being given back.
          </p>
          <div className="panel">
            <GrainLoanRecords
              loans={open}
              showParty={!person}
              showProduct
              bankAccounts={bankAccounts}
              emptyText="No open grain loans."
            />
          </div>
        </>
      );
    }
    case "dealer-products": {
      const [dealers, products, bankAccounts] = await Promise.all([
        listDealers({ type: "PRODUCTS" }),
        listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
        listBankAccounts(),
      ]);
      return <EntryFormHost entry={{ tab, dealers, products: products.products, bankAccounts, ...pick }} />;
    }
    case "dealer-grain": {
      const [dealers, products, bankAccounts] = await Promise.all([
        listDealers({ type: "GRAIN" }),
        listProducts({ stockKind: "GRAIN", pageSize: 500 }),
        listBankAccounts(),
      ]);
      return <EntryFormHost entry={{ tab, dealers, products: products.products, bankAccounts, ...pick }} />;
    }
    case "pay-dealer":
    case "receive-dealer": {
      const [sides, bankAccounts] = await Promise.all([listDealerUdhaarSides(), listBankAccounts()]);
      const dealers = sides.filter((d) => (tab === "pay-dealer" ? d.shopOwes : d.dealerOwes) > 0.01);
      return <EntryFormHost entry={{ tab, dealers, bankAccounts, ...pick }} />;
    }
    case "daily-expense":
      return <EntryFormHost entry={{ tab, bankAccounts: await listBankAccounts(), ...pick }} />;
    case "monthly-expense": {
      const [types, bankAccounts] = await Promise.all([listMonthlyExpenseTypes(), listBankAccounts()]);
      return <EntryFormHost entry={{ tab, types, bankAccounts, ...pick }} />;
    }
    case "long-term-loan":
      return <EntryFormHost entry={{ tab, bankAccounts: await listBankAccounts(), ...pick }} />;
    case "borrow-from-customer": {
      const [areas, bankAccounts] = await Promise.all([listAreas(), listBankAccounts()]);
      return <EntryFormHost entry={{ tab, areas, bankAccounts, ...pick }} />;
    }
    case "import-udhaar":
      return <EntryFormHost entry={{ tab, ...pick }} />;
    case "grain-loan": {
      const [areas, products, dealers] = await Promise.all([
        listAreas(),
        listProducts({ stockKind: "GRAIN", pageSize: 500 }),
        listDealers({ type: "GRAIN" }),
      ]);
      return (
        <EntryFormHost
          entry={{
            tab,
            areas,
            products: products.products.map((p) => ({ id: p.id, name: p.name })),
            dealers: dealers.map((d) => ({ id: d.id, name: d.name })),
            dealerName: person?.kind === "DEALER" ? person.name : undefined,
            ...pick,
          }}
        />
      );
    }
    case "add-batch": {
      const [areas, products, bankAccounts] = await Promise.all([
        listAreas(),
        listProducts({ stockKind: "GRAIN", pageSize: 500 }),
        listBankAccounts(),
      ]);
      return (
        <EntryFormHost
          entry={{ tab, areas, products: products.products.map((p) => ({ id: p.id, name: p.name })), bankAccounts, ...pick }}
        />
      );
    }
    default:
      return null;
  }
}
