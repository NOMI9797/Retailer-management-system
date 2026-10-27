import Link from "next/link";
import { listCategories, listUnits, listLowStockProducts } from "@/modules/products/actions";
import { EditProductButton } from "@/modules/products/components/EditProductButton";
import { LOW_STOCK_LIMIT } from "@/modules/products/lowStock";
import { formatStock } from "@/modules/products/units";
import { formatMoney } from "@/lib/utils";

type Tab = "all" | "out" | "low";

// Low stock: every shop product with LOW_STOCK_LIMIT or less left — the
// full list behind the Dashboard's Needs attention section. Out of
// stock first, then fewest left. Edit sets the stock (e.g. a product
// whose opening stock was never entered); Buy records a purchase.
export default async function LowStockPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "out" || rawTab === "low" ? rawTab : "all";
  const [products, categories, units] = await Promise.all([
    listLowStockProducts(),
    listCategories(false, "SIMPLE"),
    listUnits(),
  ]);

  const out = products.filter((p) => Number(p.quantity) <= 0);
  const low = products.filter((p) => Number(p.quantity) > 0);
  const shown = tab === "out" ? out : tab === "low" ? low : products;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Low stock</h1>
          <p>Shop products with {LOW_STOCK_LIMIT} or less left (grain is on the Grain page).</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/dashboard/products" className="btn btn-ghost">
            All products
          </Link>
          <Link href="/dashboard/daily-sales/new?tab=dealer-products" className="btn btn-primary">
            Buy stock
          </Link>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <div className="stat-card">
          <p className="stat-label">Low stock products</p>
          <p className="stat-value">{products.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Out of stock</p>
          <p className="stat-value tone-consigned">{out.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Running low (1–{LOW_STOCK_LIMIT})</p>
          <p className="stat-value tone-grain">{low.length}</p>
        </div>
      </div>

      <div className="tabs">
        <Link className={`tab${tab === "all" ? " active" : ""}`} href="/dashboard/products/low-stock">
          All ({products.length})
        </Link>
        <Link className={`tab${tab === "out" ? " active" : ""}`} href="/dashboard/products/low-stock?tab=out">
          Out of stock ({out.length})
        </Link>
        <Link className={`tab${tab === "low" ? " active" : ""}`} href="/dashboard/products/low-stock?tab=low">
          Running low ({low.length})
        </Link>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>In stock</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Cost price</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={6}>{tab === "out" ? "Nothing is out of stock." : "All products are stocked."}</td>
              </tr>
            ) : (
              shown.map((p) => {
                const quantity = Number(p.quantity);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <span className="cat-pill">{p.category.name}</span>
                    </td>
                    <td className={`num${quantity > 0 ? " qty-low" : ""}`}>{formatStock(Math.max(quantity, 0), p)}</td>
                    <td>
                      <span className={`pay-badge ${quantity <= 0 ? "pay-credit" : "pay-mixed"}`}>
                        {quantity <= 0 ? "Out of stock" : "Running low"}
                      </span>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatMoney(Number(p.costPrice))}
                    </td>
                    <td>
                      <div className="row-actions">
                        <EditProductButton product={p} categories={categories} units={units} />
                        <Link href="/dashboard/daily-sales/new?tab=dealer-products" className="btn btn-ghost">
                          Buy
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
