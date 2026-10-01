import { Suspense } from "react";
import Link from "next/link";
import { PageLoader } from "@/components/shared/PageLoader";
import { DebtSummaryCards } from "./DebtSummaryCards";
import { DebtorTable } from "./DebtorTable";
import { DefaulterTable } from "./DefaulterTable";
import { ShopUdhaarSummaryCards } from "./ShopUdhaarSummaryCards";
import { ShopUdhaarTable } from "./ShopUdhaarTable";
import { BorrowedFromCustomersSummaryCards } from "./BorrowedFromCustomersSummaryCards";
import { BorrowedFromCustomersTable } from "./BorrowedFromCustomersTable";
import { ShopGrainUdhaarSummaryCards } from "./ShopGrainUdhaarSummaryCards";
import { ShopGrainUdhaarTable } from "./ShopGrainUdhaarTable";
import { GrainProductFilter } from "./GrainProductFilter";
import { LongTermLoanModal } from "@/modules/customers/components/LongTermLoanModal";
import { ShopBorrowedLoanModal } from "@/modules/customers/components/ShopBorrowedLoanModal";
import { CustomerGrainCreditSection } from "../grain/CustomerGrainCreditSection";
import { listAreas } from "@/modules/settings/areas.actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { buildDebtsHref, type DebtsSearchParams } from "./searchParamsHref";

type Group = "customers" | "shop";
type CustomerTab = "regular" | "long-term" | "defaulters" | "grain-udhaar";
type ShopTab = "credit-expenses" | "borrowed" | "grain-udhaar";

// Two levels of tabs: Customers (Udhaar) — who owes the shop money —
// vs Shop (Udhaar) — what the shop itself owes. Customers (Udhaar)
// keeps its original three subtabs (Regular/Daily, Long-term,
// Defaulters). Shop (Udhaar) has two subtabs of its own: Credit
// Expenses (unpaid Expense rows) and Borrowed from Customers (cash
// the shop itself took from a customer, not tied to any sale/expense
// — the mirror of Long-term Udhaar). Not cached — a shopkeeper
// recording a repayment right here expects this page to reflect it on
// the very next load, same reasoning as the Dashboard/Reports
// "nothing cached" requirement.
export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<DebtsSearchParams>;
}) {
  const params = await searchParams;
  const group: Group = params.group === "shop" ? "shop" : "customers";
  const tab: CustomerTab =
    params.tab === "long-term"
      ? "long-term"
      : params.tab === "defaulters"
        ? "defaulters"
        : params.tab === "grain-udhaar"
          ? "grain-udhaar"
          : "regular";
  const shopTab: ShopTab =
    params.tab === "borrowed" ? "borrowed" : params.tab === "grain-udhaar" ? "grain-udhaar" : "credit-expenses";
  const productFilter = params.product || undefined;
  const [areas, bankAccounts] = await Promise.all([
    group === "shop" && shopTab === "borrowed" ? listAreas() : Promise.resolve([]),
    group === "customers" && tab === "long-term" ? listBankAccounts() : group === "shop" && shopTab === "borrowed" ? listBankAccounts() : Promise.resolve([]),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Udhaar</h1>
          <p>
            {group === "shop"
              ? shopTab === "borrowed"
                ? "Cash the shop itself borrowed from a customer — not tied to a sale or purchase."
                : shopTab === "grain-udhaar"
                  ? "Grain the shop bought from customers on Credit at a settled rate and hasn't paid out yet."
                  : "Money the shop itself owes — Daily/Monthly expenses not yet paid off."
              : tab === "regular"
                ? "Who owes the shop money from purchases — loans and on-account balances, in one place."
                : tab === "long-term"
                  ? "Deliberate cash loans with a chosen term, separate from purchase-driven Udhaar."
                  : tab === "grain-udhaar"
                    ? "Customers who bought grain from the shop on Credit and haven't paid yet."
                    : "Everyone more than a week past their due date, from either kind of Udhaar."}
          </p>
        </div>
        {group === "customers" && tab === "long-term" && <LongTermLoanModal bankAccounts={bankAccounts} />}
        {group === "shop" && shopTab === "borrowed" && <ShopBorrowedLoanModal areas={areas} bankAccounts={bankAccounts} />}
      </div>

      <div className="tabs">
        <Link
          className={`tab${group === "customers" ? " active" : ""}`}
          href={buildDebtsHref({ group: "customers", tab: "regular" })}
        >
          Customers (Udhaar)
        </Link>
        <Link
          className={`tab${group === "shop" ? " active" : ""}`}
          href={buildDebtsHref({ group: "shop", tab: "credit-expenses" })}
        >
          Shop (Udhaar)
        </Link>
      </div>

      {group === "customers" ? (
        <>
          <div className="tabs" style={{ marginTop: 4 }}>
            <Link
              className={`tab${tab === "regular" ? " active" : ""}`}
              href={buildDebtsHref({ group: "customers", tab: "regular" })}
            >
              Regular / Daily Udhaar
            </Link>
            <Link
              className={`tab${tab === "long-term" ? " active" : ""}`}
              href={buildDebtsHref({ group: "customers", tab: "long-term" })}
            >
              Long-term Udhaar
            </Link>
            <Link
              className={`tab${tab === "defaulters" ? " active" : ""}`}
              href={buildDebtsHref({ group: "customers", tab: "defaulters" })}
            >
              Defaulters
            </Link>
            <Link
              className={`tab${tab === "grain-udhaar" ? " active" : ""}`}
              href={buildDebtsHref({ group: "customers", tab: "grain-udhaar" })}
            >
              Grain Udhaar
            </Link>
          </div>

          {tab === "grain-udhaar" ? (
            <>
              <Suspense key="filter-customers-grain-udhaar" fallback={null}>
                <GrainProductFilter
                  productId={productFilter}
                  buildHref={(productId) => buildDebtsHref({ group: "customers", tab: "grain-udhaar", product: productId })}
                />
              </Suspense>
              <Suspense key={`table-grain-udhaar-${productFilter ?? "all"}`} fallback={<PageLoader label="Loading…" />}>
                <CustomerGrainCreditSection productId={productFilter} />
              </Suspense>
            </>
          ) : (
            <>
              {tab !== "defaulters" && (
                <Suspense key={`summary-${tab}`} fallback={<PageLoader label="Loading summary…" />}>
                  <DebtSummaryCards bucket={tab === "long-term" ? "LONG_TERM" : "REGULAR"} />
                </Suspense>
              )}

              <Suspense key={`table-${tab}`} fallback={<PageLoader label="Loading…" />}>
                {tab === "defaulters" ? (
                  <DefaulterTable />
                ) : (
                  <DebtorTable bucket={tab === "long-term" ? "LONG_TERM" : "REGULAR"} />
                )}
              </Suspense>
            </>
          )}
        </>
      ) : (
        <>
          <div className="tabs" style={{ marginTop: 4 }}>
            <Link
              className={`tab${shopTab === "credit-expenses" ? " active" : ""}`}
              href={buildDebtsHref({ group: "shop", tab: "credit-expenses" })}
            >
              Daily/Monthly Udhaar
            </Link>
            <Link
              className={`tab${shopTab === "borrowed" ? " active" : ""}`}
              href={buildDebtsHref({ group: "shop", tab: "borrowed" })}
            >
              Borrowed from Customers
            </Link>
            <Link
              className={`tab${shopTab === "grain-udhaar" ? " active" : ""}`}
              href={buildDebtsHref({ group: "shop", tab: "grain-udhaar" })}
            >
              Grain Udhaar
            </Link>
          </div>

          {shopTab === "credit-expenses" ? (
            <>
              <Suspense key="summary-shop-expenses" fallback={<PageLoader label="Loading summary…" />}>
                <ShopUdhaarSummaryCards />
              </Suspense>
              <Suspense key="table-shop-expenses" fallback={<PageLoader label="Loading…" />}>
                <ShopUdhaarTable />
              </Suspense>
            </>
          ) : shopTab === "borrowed" ? (
            <>
              <Suspense key="summary-shop-borrowed" fallback={<PageLoader label="Loading summary…" />}>
                <BorrowedFromCustomersSummaryCards />
              </Suspense>
              <Suspense key="table-shop-borrowed" fallback={<PageLoader label="Loading…" />}>
                <BorrowedFromCustomersTable />
              </Suspense>
            </>
          ) : (
            <>
              <Suspense key="filter-shop-grain-udhaar" fallback={null}>
                <GrainProductFilter
                  productId={productFilter}
                  buildHref={(productId) => buildDebtsHref({ group: "shop", tab: "grain-udhaar", product: productId })}
                />
              </Suspense>
              <Suspense key={`summary-shop-grain-udhaar-${productFilter ?? "all"}`} fallback={<PageLoader label="Loading summary…" />}>
                <ShopGrainUdhaarSummaryCards productId={productFilter} />
              </Suspense>
              <Suspense key={`table-shop-grain-udhaar-${productFilter ?? "all"}`} fallback={<PageLoader label="Loading…" />}>
                <ShopGrainUdhaarTable productId={productFilter} />
              </Suspense>
            </>
          )}
        </>
      )}
    </div>
  );
}
