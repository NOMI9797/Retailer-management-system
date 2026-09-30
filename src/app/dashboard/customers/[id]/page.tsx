import { Suspense } from "react";
import Link from "next/link";
import { getCustomer, getCustomerShopBorrowedHistory } from "@/modules/customers/actions";
import { getCustomerPurchaseHistory, getCustomerGrainCreditPurchases } from "@/modules/daily-sales/actions";
import { listCategories, listUnits, listProducts } from "@/modules/products/actions";
import { getCustomerGrainDeposits, getShopOwedForGrainByProduct } from "@/modules/stock/actions";
import { CustomerGrainSection } from "@/modules/stock/components/CustomerGrainSection";
import { PageLoader } from "@/components/shared/PageLoader";
import { PurchaseHistoryList } from "./PurchaseHistoryList";
import { ShopBorrowedHistoryPanel } from "./ShopBorrowedHistoryPanel";
import { CustomerGrainCreditPanel } from "./CustomerGrainCreditPanel";
import { buildCustomerDetailHref, type CustomerDetailSearchParams } from "./searchParamsHref";

const TAB_LABELS = {
  "purchase-history": "Purchase history",
  grain: "Grain",
  "udhaar-to-shop": "Udhaar to Shop",
} as const;
type Tab = keyof typeof TAB_LABELS;

// Static shell (back link) instant, the actual customer + ledger data
// streams in behind its own Suspense boundary — same shape as every
// other detail page in the app. Purchase history / Grain / Udhaar to
// Shop are tabs below the header — same real ?tab= navigation pattern
// as Settings/Expenses/Reports/New Sale, rather than all stacked one
// after another. The raw Accounts ledger card is deliberately not
// shown here for now — not needed on this page currently.
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
  const { tab: rawTab, grainView: rawGrainView } = await searchParams;
  const tab: Tab = rawTab === "grain" ? "grain" : rawTab === "udhaar-to-shop" ? "udhaar-to-shop" : "purchase-history";
  const grainView = rawGrainView === "credit-purchases" ? "credit-purchases" : "deposits";

  return (
    <div>
      <Link href="/dashboard/customers" className="back-link">
        <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Customers
      </Link>

      <Suspense fallback={<PageLoader label="Loading customer…" />}>
        <CustomerDetail id={id} />
      </Suspense>

      <div className="tabs" style={{ marginTop: 24 }}>
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
        <Suspense key="purchase-history" fallback={<PageLoader label="Loading purchase history…" />}>
          <PurchaseHistorySection customerId={id} />
        </Suspense>
      )}
      {tab === "grain" && (
        <>
          <div className="tabs" style={{ marginBottom: 16 }}>
            <Link
              className={`tab${grainView === "deposits" ? " active" : ""}`}
              href={buildCustomerDetailHref(id, { tab: "grain", grainView: "deposits" })}
            >
              Deposits
            </Link>
            <Link
              className={`tab${grainView === "credit-purchases" ? " active" : ""}`}
              href={buildCustomerDetailHref(id, { tab: "grain", grainView: "credit-purchases" })}
            >
              Customer Udhaar
            </Link>
          </div>

          {grainView === "deposits" ? (
            <Suspense key="grain-deposits" fallback={<PageLoader label="Loading grain…" />}>
              <GrainSectionLoader customerId={id} />
            </Suspense>
          ) : (
            <Suspense key="grain-credit-purchases" fallback={<PageLoader label="Loading Customer Udhaar…" />}>
              <CustomerGrainCreditSectionLoader customerId={id} />
            </Suspense>
          )}
        </>
      )}
      {tab === "udhaar-to-shop" && (
        <Suspense key="udhaar-to-shop" fallback={<PageLoader label="Loading Udhaar to Shop…" />}>
          <ShopBorrowedSectionLoader customerId={id} />
        </Suspense>
      )}
    </div>
  );
}

async function CustomerDetail({ id }: { id: string }) {
  const customer = await getCustomer(id);
  const initial = customer.name.charAt(0).toUpperCase();

  return (
    <>
      <div className="cust-header">
        <div className="cust-avatar-lg">{initial}</div>
        <div>
          <h1>{customer.name}</h1>
          <p>
            {customer.phone || "No phone"}
            {" · "}
            {customer.area?.name || "No area"}
          </p>
          {customer.notes && (
            <p style={{ marginTop: 4, fontStyle: "italic" }}>{customer.notes}</p>
          )}
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
  const [sales, categories, units, simpleProducts, grainProducts] = await Promise.all([
    getCustomerPurchaseHistory(customerId),
    listCategories(),
    listUnits(),
    listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
    listProducts({ stockKind: "GRAIN", pageSize: 500 }),
  ]);

  return (
    <PurchaseHistoryList
      sales={sales}
      products={[...simpleProducts.products, ...grainProducts.products]}
    />
  );
}

// A customer's grain deposits — its own query (GrainBatch), separate
// from both the account ledger and purchase history above. Also
// fetches how much the shop currently owes THIS customer for
// already-settled-but-unpaid grain, PER PRODUCT (see
// getShopOwedForGrainByProduct) — a money figure, shown as its own
// banner inside CustomerGrainSection, never conflated with the
// account balance above (which nets every account together) or with
// Stock Udhaar (a quantity obligation, shown shop-wide on the Grain
// page instead — see this file's header comment).
async function GrainSectionLoader({ customerId }: { customerId: string }) {
  const [customer, deposits, moneyOwedByProduct] = await Promise.all([
    getCustomer(customerId),
    getCustomerGrainDeposits(customerId),
    getShopOwedForGrainByProduct(customerId),
  ]);
  return (
    <CustomerGrainSection
      deposits={deposits}
      moneyOwedByProduct={moneyOwedByProduct}
      customerId={customerId}
      customerName={customer.name}
    />
  );
}

// Grain this customer bought FROM the shop on Credit, still
// outstanding — the mirror of GrainSectionLoader above (where the
// customer is the seller/depositor; here they're the buyer). Its own
// query (DailySaleItem, scoped to GRAIN products with a recorded
// creditAmount — see getCustomerGrainCreditPurchases), separate from
// both the deposits view and the account ledger.
async function CustomerGrainCreditSectionLoader({ customerId }: { customerId: string }) {
  const [customer, rows] = await Promise.all([
    getCustomer(customerId),
    getCustomerGrainCreditPurchases(customerId),
  ]);
  return <CustomerGrainCreditPanel customerName={customer.name} rows={rows} />;
}

// Cash this customer has given the SHOP (the opposite direction from
// every other tab on this page) — its own query
// (AccountTransaction, isShopBorrowed: true), separate from the
// Accounts ledger above (which only ever covers money the customer
// owes the shop).
async function ShopBorrowedSectionLoader({ customerId }: { customerId: string }) {
  const [customer, history] = await Promise.all([
    getCustomer(customerId),
    getCustomerShopBorrowedHistory(customerId),
  ]);
  return <ShopBorrowedHistoryPanel customerName={customer.name} history={history} />;
}
