import { listProducts, type listCategories, type listUnits } from "@/modules/products/actions";
import { formatMoney } from "@/lib/utils";
import { Pagination } from "@/modules/products/components/Pagination";
import { EditProductButton } from "@/modules/products/components/EditProductButton";
import { buildProductsHref, type ProductsSearchParams } from "./searchParamsHref";

const LOW_STOCK_THRESHOLD = 5;

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// Async Server Component — the actual product query is the only
// fetch this component makes; categories/units arrive as props
// (fetched once in page.tsx, shared with Header/FilterBar) instead
// of being re-fetched here for the edit modal. Wrapped in its own
// Suspense boundary by page.tsx, so a slow query here never blocks
// the header/filter bar from appearing. Only the edit trigger needs
// client state (see EditProductButton); rows themselves are plain
// server-rendered markup.
export async function SimpleStockTable({
  searchParams,
  categories,
  units,
}: {
  searchParams: ProductsSearchParams;
  categories: Category[];
  units: Unit[];
}) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const result = await listProducts({
    stockKind: "SIMPLE",
    categoryId: searchParams.category,
    search: searchParams.search,
    page,
  });

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Cost price</th>
              <th>Sell price</th>
              <th>Quantity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.products.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={7}>No products found.</td>
              </tr>
            ) : (
              result.products.map((product) => {
                const quantity = Number(product.quantity);
                return (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>
                      <span className="cat-pill">{product.category.name}</span>
                    </td>
                    <td>{product.unit.name}</td>
                    <td>{formatMoney(Number(product.costPrice))}</td>
                    <td>{formatMoney(Number(product.sellPrice))}</td>
                    <td className={quantity <= LOW_STOCK_THRESHOLD ? "qty-low" : undefined}>
                      {quantity}
                    </td>
                    <td>
                      <div className="row-actions">
                        <EditProductButton product={product} categories={categories} units={units} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {result.products.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 20px",
              fontSize: 12,
              color: "var(--ink-muted)",
            }}
          >
            <span>
              {result.totalCount} product{result.totalCount === 1 ? "" : "s"}
            </span>
            <span>
              {result.totalPages > 1 ? `Page ${result.page} of ${result.totalPages}` : "Showing all results"}
            </span>
          </div>
        )}
      </div>

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        totalCount={result.totalCount}
        hrefFor={(p) => buildProductsHref(searchParams, { page: String(p) })}
      />
    </>
  );
}
