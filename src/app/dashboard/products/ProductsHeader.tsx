import { AddProductModal } from "@/modules/products/components/AddProductModal";
import type { listCategories, listUnits } from "@/modules/products/actions";

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// Pure Server Component — title and the Add-product trigger are all
// static/URL-driven. categories/units arrive as props (fetched once
// in page.tsx and shared across every section that needs them) rather
// than being fetched here. AddProductModal is the one client leaf
// here — it owns its own open/close state locally rather than through
// the URL. Grain stock has its own page now (/dashboard/grain), so
// this page and header are Simple stock only — no tab switcher.
export function ProductsHeader({
  categories,
  units,
}: {
  categories: Category[];
  units: Unit[];
}) {
  return (
    <div className="page-head">
      <div>
        <h1>Product management</h1>
        <p>Everyday shop items — stock, cost, and sell price.</p>
      </div>
      <AddProductModal categories={categories} units={units} defaultStockKind="SIMPLE" lockStockKind />
    </div>
  );
}
