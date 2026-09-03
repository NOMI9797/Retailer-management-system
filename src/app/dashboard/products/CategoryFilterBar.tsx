import { listCategories } from "@/modules/products/actions";
import { CategorySelect } from "@/modules/products/components/CategorySelect";
import { SearchBox } from "@/modules/products/components/SearchBox";
import type { ProductsSearchParams } from "./searchParamsHref";

// Async Server Component — categories are cached (see
// categories.actions.ts) so this resolves almost immediately, well
// before the (slower) product list next to it. Wrapped in its own
// Suspense boundary by page.tsx so it streams in independently of
// the table/grain panel. CategorySelect and SearchBox are the only
// client leaves here (both build their own hrefs from the live URL
// via useSearchParams, since a function can't be passed to them as
// a prop from this Server Component).
export async function CategoryFilterBar({ searchParams }: { searchParams: ProductsSearchParams }) {
  const categories = await listCategories();

  return (
    <div className="filter-bar">
      <CategorySelect categories={categories} activeCategory={searchParams.category ?? ""} />
      <SearchBox activeSearch={searchParams.search ?? ""} />
    </div>
  );
}
