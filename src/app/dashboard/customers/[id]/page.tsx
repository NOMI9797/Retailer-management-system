import { LedgerReceiptModal } from "@/modules/ledger-receipt/components/LedgerReceiptModal";
import { Suspense } from "react";
import Link from "next/link";
import {
  getCustomer,
  getCustomerShopBorrowedHistory,
  getCustomerRelationshipSummary,
} from "@/modules/customers/actions";
import {
  getCustomerPurchaseHistory,
  getCustomerGrainCreditPurchases,
} from "@/modules/daily-sales/actions";
import {
  listCategories,
  listUnits,
  listProducts,
} from "@/modules/products/actions";
import {
  getCustomerGrainDeposits,
  getShopOwedForGrainByProduct,
} from "@/modules/stock/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { CustomerGrainSection } from "@/modules/stock/components/CustomerGrainSection";
import { HomeGrainRecords } from "@/modules/stock/components/HomeGrainRecords";
import { listHomeGrain } from "@/modules/stock/homeGrain.actions";
import { GrainLoansPanel } from "@/modules/grain-loans/components/GrainLoansPanel";
import { listGrainLoans } from "@/modules/grain-loans/actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { PurchaseHistoryList } from "./PurchaseHistoryList";
import { CustomerRelationshipStats } from "./CustomerRelationshipStats";
import { ShopBorrowedHistoryPanel } from "./ShopBorrowedHistoryPanel";
import { EditCustomerModal } from "@/modules/customers/components/EditCustomerModal";
import { ImportUdhaarModal } from "@/modules/customers/components/ImportUdhaarModal";
import {
  buildCustomerDetailHref,
  type CustomerDetailSearchParams,
} from "./searchParamsHref";

const TAB_LABELS = {
  "purchase-history": "Purchase history",
  grain: "Grain",
  "udhaar-to-shop": "Udhaar to Shop",
  "grain-loans": "Grain loans",
  "at-home": "Bought — at their home",
} as const;
type Tab = keyof typeof TAB_LABELS;

// Static shell (back link) instant, the actual customer + ledger data
// streams in behind its own Suspense boundary — same shape as every
// other detail page in the app. Purchase history / Grain / Udhaar to
// Shop are tabs below the header — same real ?tab= navigation pattern
// as Settings/Expenses/Reports/New Sale, rather than all stacked one
// after another. The raw Accounts ledger card (CustomerAccountsList)
// is deliberately not shown here — an imported legacy Udhaar balance
// (see ImportUdhaarModal) or a manually recorded loan/repayment both
// already surface through the existing, shop-wide Udhaar section
// (Debts page) exactly like any other recorded loan, which is the one
// place the shopkeeper actually wants to see/manage this, per
// explicit decision — this page doesn't need a second place showing
// the same balance.
//
// Stock Udhaar deliberately has NO tab here — it's a shopkeeper-side
// concern (which customers' deposited stock has been sold ahead of
// settlement, and what the shop overall owes back), not something a
// customer's own profile should surface; it lives shop-wide instead,
// on the Grain page's own Stock Udhaar tab (GrainUdhaarSection).
export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CustomerDetailSearchParams>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab =
    rawTab && rawTab in TAB_LABELS ? (rawTab as Tab) : "purchase-history";

  return (
    <div>
      <Link href="/dashboard/customers" className="back-link">
        <svg
          className="icon"
          viewBox="0 0 24 24"
          style={{ width: 14, height: 14 }}
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Customers
      </Link>

      <Suspense fallback={<PageLoader label="Loading customer…" />}>
        <CustomerDetail id={id} />
      </Suspense>

      {/* The customer's overall standing across every tab — purchases
          on Udhaar, grain, and Udhaar to Shop — so it sits above the
          tabs rather than inside any one of them. */}
      <div style={{ marginTop: 24 }}>
        <Suspense fallback={<PageLoader label="Loading totals…" />}>
          <CustomerOverallStats customerId={id} />
        </Suspense>
      </div>

      <div className="tabs" style={{ marginTop: 8 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Link
            key={t}
            className={`tab${tab === t ? " active" : ""}`}
            href={buildCustomerDetailHref(id, { tab: t })}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      {tab === "purchase-history" && (
        <Suspense
          key="purchase-history"
          fallback={<PageLoader label="Loading purchase history…" />}
        >
          <PurchaseHistorySection customerId={id} />
        </Suspense>
      )}
      {tab === "grain" && (
        <Suspense key="grain" fallback={<PageLoader label="Loading grain…" />}>
          <GrainSectionLoader customerId={id} />
        </Suspense>
      )}
      {tab === "udhaar-to-shop" && (
        <Suspense
          key="udhaar-to-shop"
          fallback={<PageLoader label="Loading Udhaar to Shop…" />}
        >
          <ShopBorrowedSectionLoader customerId={id} />
        </Suspense>
      )}
      {tab === "grain-loans" && (
        <Suspense
          key="grain-loans"
          fallback={<PageLoader label="Loading grain loans…" />}
        >
          <GrainLoansSectionLoader customerId={id} />
        </Suspense>
      )}
      {tab === "at-home" && (
        <Suspense key="at-home" fallback={<PageLoader label="Loading grain at their home…" />}>
          <HomeGrainSectionLoader customerId={id} />
        </Suspense>
      )}
    </div>
  );
}

async function CustomerOverallStats({ customerId }: { customerId: string }) {
  const [summary, customer, bankAccounts] = await Promise.all([
    getCustomerRelationshipSummary(customerId),
    getCustomer(customerId),
    listBankAccounts(),
  ]);
  return (
    <CustomerRelationshipStats
      summary={summary}
      customerId={customerId}
      customerName={customer.name}
      bankAccounts={bankAccounts}
    />
  );
}

async function CustomerDetail({ id }: { id: string }) {
  const [customer, areas, bankAccounts] = await Promise.all([
    getCustomer(id),
    listAreas(),
    listBankAccounts(),
  ]);
  const initial = customer.name.charAt(0).toUpperCase();

  return (
    <>
      <div className="cust-header" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div className="cust-avatar-lg">{initial}</div>
          <div>
            <h1>{customer.name}</h1>
            <p>
              {customer.phone || "No phone"}
              {" · "}
              {customer.area?.name || "No area"}
            </p>
            {customer.notes && (
              <p style={{ marginTop: 4, fontStyle: "italic" }}>
                {customer.notes}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <LedgerReceiptModal customer={{ id: customer.id, name: customer.name }} />
          <ImportUdhaarModal
            customerId={customer.id}
            customerName={customer.name}
            bankAccounts={bankAccounts}
          />
          <EditCustomerModal areas={areas} customer={customer} />
        </div>
      </div>
    </>
  );
}

// Purchase history is a genuinely separate query from the account
// ledger above (different tables entirely — DailySale/DailySaleItem
// vs. CustomerAccount/AccountTransaction), per the milestone's
// explicit "two distinct panels that must not be collapsed into one"
// requirement.
async function PurchaseHistorySection({ customerId }: { customerId: string }) {
  const [
    sales,
    categories,
    units,
    simpleProducts,
    grainProducts,
    bankAccounts,
  ] = await Promise.all([
    getCustomerPurchaseHistory(customerId),
    listCategories(),
    listUnits(),
    // includeInactive — see DailyLedgerSection.tsx's identical comment:
    // this feeds PurchaseHistoryList's EditSaleModal, which must still
    // resolve a deactivated product an old sale already used.
    listProducts({ stockKind: "SIMPLE", pageSize: 500, includeInactive: true }),
    listProducts({ stockKind: "GRAIN", pageSize: 500, includeInactive: true }),
    listBankAccounts(),
  ]);

  return (
    <PurchaseHistoryList
      sales={sales}
      products={[...simpleProducts.products, ...grainProducts.products]}
      bankAccounts={bankAccounts}
    />
  );
}

// A customer's whole Grain relationship — deposits/settlements
// (GrainBatch) AND grain they bought FROM the shop on Credit
// (DailySaleItem — see getCustomerGrainCreditPurchases), merged into
// one chronological list by CustomerGrainSection rather than two
// separate subtabs, since both are just "grain events involving this
// customer," only differing in which direction the money/stock moved.
// Also fetches how much the shop currently owes THIS customer for
// already-settled-but-unpaid grain, PER PRODUCT (see
// getShopOwedForGrainByProduct) — a money figure, shown as its own
// banner inside CustomerGrainSection, never conflated with the
// account balance above (which nets every account together) or with
// Stock Udhaar (a quantity obligation, shown shop-wide on the Grain
// page instead — see this file's header comment).
async function GrainSectionLoader({ customerId }: { customerId: string }) {
  const [
    customer,
    deposits,
    moneyOwedByProduct,
    creditPurchases,
    bankAccounts,
    grainProducts,
  ] = await Promise.all([
    getCustomer(customerId),
    getCustomerGrainDeposits(customerId),
    getShopOwedForGrainByProduct(customerId),
    // includePaid — the Grain tab keeps a paid-off grain sale listed
    // (as "Paid") instead of dropping it.
    getCustomerGrainCreditPurchases(customerId, undefined, {
      includePaid: true,
    }),
    listBankAccounts(),
    // includeInactive — EditSaleModal must still resolve a
    // deactivated product an old grain sale already used, same
    // reasoning as PurchaseHistorySection's identical fetch.
    listProducts({ stockKind: "GRAIN", pageSize: 500, includeInactive: true }),
  ]);
  return (
    <CustomerGrainSection
      deposits={deposits}
      moneyOwedByProduct={moneyOwedByProduct}
      creditPurchases={creditPurchases}
      customerId={customerId}
      customerName={customer.name}
      bankAccounts={bankAccounts}
      products={grainProducts.products}
    />
  );
}

// Grain the shop bought from this customer that was left at their home
// — its own tab: what's still there, each pickup trip, Pick up.
async function HomeGrainSectionLoader({ customerId }: { customerId: string }) {
  const [homeGrain, bankAccounts] = await Promise.all([listHomeGrain({ customerId }), listBankAccounts()]);
  return (
    <section className="panel">
      <HomeGrainRecords
        rows={homeGrain}
        showCustomer={false}
        showProduct
        bankAccounts={bankAccounts}
        emptyText="Nothing bought from this customer is at their home. Record one from New entry → Buy/Keep stock → Bought — still at their home."
      />
    </section>
  );
}

// Grain lent to / borrowed from this customer, every grain — its own
// tab, like Udhaar to Shop.
async function GrainLoansSectionLoader({ customerId }: { customerId: string }) {
  const [customer, loans, bankAccounts, grainProducts] = await Promise.all([
    getCustomer(customerId),
    listGrainLoans({ customerId }),
    listBankAccounts(),
    listProducts({ stockKind: "GRAIN", pageSize: 500 }),
  ]);
  return (
    <GrainLoansPanel
      party={{ kind: "CUSTOMER", id: customerId, name: customer.name }}
      loans={loans}
      products={grainProducts.products.map((p) => ({ id: p.id, name: p.name }))}
      bankAccounts={bankAccounts}
    />
  );
}

// Cash this customer has given the SHOP (the opposite direction from
// every other tab on this page) — its own query
// (AccountTransaction, isShopBorrowed: true), separate from the
// Accounts ledger above (which only ever covers money the customer
// owes the shop).
async function ShopBorrowedSectionLoader({
  customerId,
}: {
  customerId: string;
}) {
  const [customer, history, bankAccounts] = await Promise.all([
    getCustomer(customerId),
    getCustomerShopBorrowedHistory(customerId),
    listBankAccounts(),
  ]);
  return (
    <ShopBorrowedHistoryPanel
      customerId={customerId}
      customerName={customer.name}
      history={history}
      bankAccounts={bankAccounts}
    />
  );
}
