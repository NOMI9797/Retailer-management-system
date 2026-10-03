import { Suspense } from "react";
import Link from "next/link";
import { PageLoader } from "@/components/shared/PageLoader";
import { DealerProductsSection } from "./DealerProductsSection";
import { DealerGrainSection } from "./DealerGrainSection";
import { DealerAccountsSection } from "./DealerAccountsSection";
import { buildDealersHref, type DealersSearchParams } from "./searchParamsHref";

// Dealer — one top-level section covering bulk Products purchases,
// bulk Grain purchases, and every dealer's own running balance
// (Accounts), split into three subtabs rather than separate sidebar
// entries, same real-navigation ?tab= pattern the Grain page's own
// Grain/Stock Udhaar switcher uses.
export default async function DealersPage({
  searchParams,
}: {
  searchParams: Promise<DealersSearchParams>;
}) {
  const params = await searchParams;
  const tab = params.tab === "grain" ? "grain" : params.tab === "accounts" ? "accounts" : "products";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dealer</h1>
          <p>Bulk purchases from dealers — what you&apos;ve paid, and what&apos;s still owed.</p>
        </div>
      </div>

      <div className="tabs">
        <Link className={`tab${tab === "products" ? " active" : ""}`} href={buildDealersHref({ tab: "products" })}>
          Products
        </Link>
        <Link className={`tab${tab === "grain" ? " active" : ""}`} href={buildDealersHref({ tab: "grain" })}>
          Grain
        </Link>
        <Link className={`tab${tab === "accounts" ? " active" : ""}`} href={buildDealersHref({ tab: "accounts" })}>
          Accounts
        </Link>
      </div>

      {tab === "products" ? (
        <Suspense key="products" fallback={<PageLoader label="Loading dealer purchases…" />}>
          <DealerProductsSection />
        </Suspense>
      ) : tab === "grain" ? (
        <Suspense key="grain" fallback={<PageLoader label="Loading dealer grain…" />}>
          <DealerGrainSection />
        </Suspense>
      ) : (
        <Suspense key="accounts" fallback={<PageLoader label="Loading dealer accounts…" />}>
          <DealerAccountsSection />
        </Suspense>
      )}
    </div>
  );
}
