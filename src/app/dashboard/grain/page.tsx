import { Suspense } from "react";
import { listProducts } from "@/modules/products/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { AddBatchModal } from "@/modules/products/components/AddBatchModal";
import { GrainPageHeader } from "./GrainPageHeader";
import { GrainStockList } from "./GrainStockList";
import { GrainUdhaarSection } from "./GrainUdhaarSection";
import { PageLoader } from "@/components/shared/PageLoader";
import type { GrainSearchParams } from "./searchParamsHref";

// Grain's own top-level page — two top-level tabs (Grain / Stock
// Udhaar, via ?tab=), same real-navigation pattern as Expenses'
// Daily/Monthly switcher. Within the Grain tab, GrainStockList renders
// its own product sub-tabs (?product=). Stock Udhaar shows
// GrainUdhaarSection directly — the shop's own stock shortfall to
// customers. "Customer Udhaar" (money customers owe the shop for
// grain bought on Credit) now lives on the Debts page as a "Grain
// Udhaar" subtab under Customers (Udhaar), alongside the shop's other
// Udhaar buckets, rather than duplicated here — see
// CustomerGrainCreditSection, now rendered from debts/page.tsx.
// The grain product list is fetched here for the header's product
// dropdown; adding/editing grain products lives in Settings → Grain
// products.
export default async function GrainPage({
  searchParams,
}: {
  searchParams: Promise<GrainSearchParams>;
}) {
  const params = await searchParams;
  const tab = params.tab === "udhaar" ? "udhaar" : "grain";
  const grainProducts = await listProducts({
    stockKind: "GRAIN",
    pageSize: 500,
    includeInactive: true,
  });
  // Stock Udhaar only covers active grain products (GrainUdhaarSection),
  // so its dropdown lists just those; the Grain tab lists all.
  const products = grainProducts.products
    .filter((p) => tab === "grain" || p.isActive)
    .map((p) => ({ id: p.id, name: p.name, isActive: p.isActive }));
  // Add batch sits in the tab row, for the grain picked in the dropdown.
  const activeProductId =
    tab === "grain"
      ? (products.find((p) => p.id === params.product) ?? products[0])?.id
      : undefined;
  const [areas, bankAccounts] = activeProductId
    ? await Promise.all([listAreas(), listBankAccounts()])
    : [[], []];

  return (
    <div>
      <GrainPageHeader
        searchParams={params}
        products={products}
        tabAction={
          activeProductId && (
            <AddBatchModal
              productId={activeProductId}
              areas={areas}
              bankAccounts={bankAccounts}
            />
          )
        }
      />

      {tab === "grain" ? (
        <Suspense
          key={JSON.stringify(params)}
          fallback={<PageLoader label="Loading grain stock…" />}
        >
          <GrainStockList searchParams={params} />
        </Suspense>
      ) : (
        <Suspense
          key={JSON.stringify(params)}
          fallback={<PageLoader label="Loading Stock Udhaar…" />}
        >
          <GrainUdhaarSection searchParams={params} />
        </Suspense>
      )}
    </div>
  );
}
