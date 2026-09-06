import { getProductStats } from "@/modules/products/actions";
import { formatMoney } from "@/lib/utils";

// Shop-wide snapshot — always the full catalog, regardless of which
// tab or filters the sections below are currently narrowed to.
// stockValue is computed live from each product's current cost price
// and quantity on every fetch, so an edited price is reflected the
// next time this renders — nothing here is a stored/cached snapshot.
export async function ProductsStatRow() {
  const stats = await getProductStats();

  return (
    <div className="stat-grid products-stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">Simple stock items</p>
        <p className="stat-value">{stats.simpleCount}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Grain products</p>
        <p className="stat-value">{stats.grainCount}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Categories</p>
        <p className="stat-value">{stats.categoryCount}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Stock value (simple)</p>
        <p className="stat-value tone-primary">{formatMoney(stats.stockValue)}</p>
      </div>
    </div>
  );
}
