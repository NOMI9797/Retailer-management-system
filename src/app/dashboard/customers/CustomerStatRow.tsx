import { getCustomerStats } from "@/modules/customers/actions";

// Shop-wide snapshot — always the full customer base, regardless of
// whatever the filter bar/table below are currently narrowed to.
export async function CustomerStatRow() {
  const stats = await getCustomerStats();

  return (
    <div className="stat-grid customers-stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">Total customers</p>
        <p className="stat-value">{stats.totalCustomers}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">With an active account</p>
        <p className="stat-value">{stats.withAccount}</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Areas covered</p>
        <p className="stat-value">{stats.areasCovered}</p>
      </div>
    </div>
  );
}
