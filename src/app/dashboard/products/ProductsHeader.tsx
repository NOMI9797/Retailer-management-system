import Link from "next/link";
import { buildProductsHref, type ProductsSearchParams } from "./searchParamsHref";
import { AddProductModal } from "@/modules/products/components/AddProductModal";
import { listCategories, listUnits } from "@/modules/products/actions";

// Pure Server Component — title, tabs, and the Add-product trigger
// are all static/URL-driven or backed by cheap cached data, so this
// renders instantly with no dependency on the (slower) product/grain
// queries. Tab switching is a real navigation (a plain <Link>
// changing ?tab=), not client-side state, so it never waits on the
// data underneath it. AddProductModal is the one client leaf here —
// it owns its own open/close state locally rather than through the URL.
export async function ProductsHeader({ searchParams }: { searchParams: ProductsSearchParams }) {
  const tab = searchParams.tab === "grain" ? "grain" : "simple";
  const [categories, units] = await Promise.all([listCategories(), listUnits()]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Product management</h1>
          <p>Everything the shop sells — simple stock and grain, tracked separately.</p>
        </div>
        <AddProductModal categories={categories} units={units} />
      </div>

      <div className="tabs">
        <Link
          className={`tab${tab === "simple" ? " active" : ""}`}
          href={buildProductsHref(searchParams, { tab: "simple" })}
        >
          Simple stock
        </Link>
        <Link
          className={`tab${tab === "grain" ? " active" : ""}`}
          href={buildProductsHref(searchParams, { tab: "grain" })}
        >
          Grain stock
        </Link>
      </div>
    </>
  );
}
