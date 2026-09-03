import { listGrainProductDetailsForShop } from "@/modules/products/actions";
import { GrainBatchList } from "@/modules/products/components/GrainBatchList";
import { Pagination } from "@/modules/products/components/Pagination";
import { buildProductsHref, type ProductsSearchParams } from "./searchParamsHref";

// Async Server Component — the slow one (batches + owner customer
// joins). Wrapped in its own Suspense boundary by page.tsx, so it
// never blocks the header, tabs, or filter bar from appearing; those
// stream in via their own faster boundaries regardless of how long
// this one takes.
export async function GrainStockPanel({ searchParams }: { searchParams: ProductsSearchParams }) {
  const grainPage = searchParams.grainPage ? Number(searchParams.grainPage) : 1;
  const result = await listGrainProductDetailsForShop({ page: grainPage });

  return (
    <>
      <div className="panel">
        {result.products.length === 0 ? (
          <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
            No grain products yet — add one to start tracking batches.
          </p>
        ) : (
          result.products.map((product) => (
            <GrainBatchList key={product.id} product={product} detail={result.details[product.id]} />
          ))
        )}
      </div>

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        totalCount={result.totalCount}
        hrefFor={(p) => buildProductsHref(searchParams, { grainPage: String(p) })}
      />
    </>
  );
}
