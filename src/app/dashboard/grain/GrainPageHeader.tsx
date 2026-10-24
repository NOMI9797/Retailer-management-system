import Link from "next/link";
import { GrainProductSelect } from "./GrainProductSelect";
import { buildGrainHref, type GrainSearchParams } from "./searchParamsHref";

// Pure Server Component — title, the grain product dropdown, and the
// top-level Grain/Stock Udhaar tab switcher. Same real-navigation
// ?tab= pattern as Expenses' Daily/Monthly tabs — a plain <Link>, not
// client-side state, so switching never waits on data underneath it.
// The grain dropdown drives both tabs, and switching tabs keeps the
// grain that's picked.
export function GrainPageHeader({
  searchParams,
  products,
  tabAction,
}: {
  searchParams: GrainSearchParams;
  products: { id: string; name: string; isActive: boolean }[];
  // Shown at the right end of the Grain / Stock Udhaar tab row (the
  // Grain tab's Add batch).
  tabAction?: React.ReactNode;
}) {
  const tab = searchParams.tab === "udhaar" ? "udhaar" : "grain";
  const activeId = (
    products.find((p) => p.id === searchParams.product) ?? products[0]
  )?.id;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grain</h1>
        </div>
        {activeId && (
          <GrainProductSelect products={products} activeId={activeId} />
        )}
      </div>

      <div className="tabs">
        <Link
          className={`tab${tab === "grain" ? " active" : ""}`}
          href={buildGrainHref(searchParams, {
            tab: "grain",
            page: undefined,
          })}
        >
          Grain
        </Link>
        <Link
          className={`tab${tab === "udhaar" ? " active" : ""}`}
          href={buildGrainHref(searchParams, {
            tab: "udhaar",
            page: undefined,
          })}
        >
          Stock Udhaar
        </Link>
        {tabAction && (
          <div
            style={{
              marginLeft: "auto",
              alignSelf: "center",
              paddingBottom: 6,
            }}
          >
            {tabAction}
          </div>
        )}
      </div>
    </>
  );
}
