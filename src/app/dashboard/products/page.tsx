import {
  listCategories,
  listUnits,
  listProducts,
  listGrainProductDetailsForShop,
} from "@/modules/products/actions";
import { ProductsClient } from "./ProductsClient";

// Server Component: every read happens here, during server rendering
// — categories, simple products (filtered server-side via search
// params), and every grain product's batches in one round trip. The
// client only receives finished data and renders it; it never fetches
// on its own. Writes (add/edit/rename) still go through Server
// Actions from the client islands in ProductsClient.
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string; page?: string; grainPage?: string }>;
}) {
  const { category, search, page, grainPage } = await searchParams;

  const [categories, units, simpleResult, grainResult] = await Promise.all([
    listCategories(),
    listUnits(),
    listProducts({
      stockKind: "SIMPLE",
      categoryId: category,
      search,
      page: page ? Number(page) : 1,
    }),
    listGrainProductDetailsForShop({ page: grainPage ? Number(grainPage) : 1 }),
  ]);

  return (
    <ProductsClient
      categories={categories}
      units={units}
      simpleProducts={simpleResult.products}
      simplePagination={{
        page: simpleResult.page,
        totalPages: simpleResult.totalPages,
        totalCount: simpleResult.totalCount,
      }}
      grainProducts={grainResult.products}
      grainDetails={grainResult.details}
      grainPagination={{
        page: grainResult.page,
        totalPages: grainResult.totalPages,
        totalCount: grainResult.totalCount,
      }}
      activeCategory={category ?? ""}
      activeSearch={search ?? ""}
    />
  );
}
