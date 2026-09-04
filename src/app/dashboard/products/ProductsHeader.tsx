import Link from "next/link";
import { buildProductsHref, type ProductsSearchParams } from "./searchParamsHref";
import { AddProductModal } from "@/modules/products/components/AddProductModal";
import type { listCategories, listUnits } from "@/modules/products/actions";

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// Pure Server Component — title, tabs, and the Add-product trigger
// are all static/URL-driven. categories/units arrive as props
// (fetched once in page.tsx and shared across every section that
// needs them) rather than being fetched here — this used to call
// listCategories()/listUnits() itself, which meant the same data was
// fetched separately in three places on one page. Tab switching is a
// real navigation (a plain <Link> changing ?tab=), not client-side
// state, so it never waits on the data underneath it. AddProductModal
// is the one client leaf here — it owns its own open/close state
// locally rather than through the URL.
export function ProductsHeader({
  searchParams,
  categories,
  units,
}: {
  searchParams: ProductsSearchParams;
  categories: Category[];
  units: Unit[];
}) {
  const tab = searchParams.tab === "grain" ? "grain" : "simple";

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
