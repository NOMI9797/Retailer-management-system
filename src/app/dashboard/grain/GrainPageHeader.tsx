import Link from "next/link";
import { AddProductModal } from "@/modules/products/components/AddProductModal";
import type { listCategories, listUnits } from "@/modules/products/actions";
import { buildGrainHref, type GrainSearchParams } from "./searchParamsHref";

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// Pure Server Component — title, the Add-grain-product trigger, and
// the top-level Grain/Stock Udhaar tab switcher. Same real-navigation
// ?tab= pattern as Expenses' Daily/Monthly tabs — a plain <Link>, not
// client-side state, so switching never waits on data underneath it.
// The Add-product trigger only makes sense on the Grain tab (there's
// nothing to "add" on Stock Udhaar, which is a pure rollup), so it's
// hidden on that tab rather than left dangling.
export function GrainPageHeader({
  searchParams,
  categories,
  units,
}: {
  searchParams: GrainSearchParams;
  categories: Category[];
  units: Unit[];
}) {
  const tab = searchParams.tab === "udhaar" ? "udhaar" : "grain";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grain</h1>
        </div>
        {tab === "grain" && (
          <AddProductModal
            categories={categories}
            units={units}
            defaultStockKind="GRAIN"
            lockStockKind
            label="Add grain product"
          />
        )}
      </div>

      <div className="tabs">
        <Link
          className={`tab${tab === "grain" ? " active" : ""}`}
          href={buildGrainHref(searchParams, { tab: "grain", product: undefined, page: undefined })}
        >
          Grain
        </Link>
        <Link
          className={`tab${tab === "udhaar" ? " active" : ""}`}
          href={buildGrainHref(searchParams, { tab: "udhaar", product: undefined, page: undefined })}
        >
          Stock Udhaar
        </Link>
      </div>
    </>
  );
}
