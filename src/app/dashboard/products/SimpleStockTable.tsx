import { listProducts, listCategories, listUnits } from "@/modules/products/actions";
import { formatMoney } from "@/lib/utils";
import { Pagination } from "@/modules/products/components/Pagination";
import { EditProductButton } from "@/modules/products/components/EditProductButton";
import { buildProductsHref, type ProductsSearchParams } from "./searchParamsHref";

const LOW_STOCK_THRESHOLD = 5;

// Async Server Component — the actual product query, wrapped in its
// own Suspense boundary by page.tsx. Renders independently of
// CategoryFilterBar/GrainStockPanel, so a slow query here (or in the
// grain panel) never blocks the other from appearing. Only the edit
// trigger needs client state (see EditProductLink); rows themselves
// are plain server-rendered markup.
export async function SimpleStockTable({ searchParams }: { searchParams: ProductsSearchParams }) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const [result, categories, units] = await Promise.all([
    listProducts({
      stockKind: "SIMPLE",
      categoryId: searchParams.category,
      search: searchParams.search,
      page,
    }),
    listCategories(),
    listUnits(),
  ]);

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
