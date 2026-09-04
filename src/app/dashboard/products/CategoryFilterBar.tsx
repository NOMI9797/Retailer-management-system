import { CategorySelect } from "@/modules/products/components/CategorySelect";
import { SearchBox } from "@/modules/products/components/SearchBox";
import type { listCategories } from "@/modules/products/actions";
import type { ProductsSearchParams } from "./searchParamsHref";

type Category = Awaited<ReturnType<typeof listCategories>>[number];

// Pure Server Component — categories arrive as a prop (fetched once
// in page.tsx and shared with ProductsHeader/SimpleStockTable)
// rather than being fetched here again. CategorySelect and SearchBox
// are the only client leaves (both build their own hrefs from the
// live URL via useSearchParams, since a function can't be passed to
// them as a prop from this Server Component).
export function CategoryFilterBar({
  searchParams,
  categories,
}: {
  searchParams: ProductsSearchParams;
  categories: Category[];
}) {
  return (
    <div className="filter-bar">
      <CategorySelect categories={categories} activeCategory={searchParams.category ?? ""} />
      <SearchBox activeSearch={searchParams.search ?? ""} />
    </div>
  );
}
