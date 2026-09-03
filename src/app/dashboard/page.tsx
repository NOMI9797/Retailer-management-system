// Placeholder — real numbers come from the Cash Flow and Reports
// modules once built. This page exists to prove the shell/routing
// works end to end before any real feature logic is added.
export default function DashboardPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shop dashboard</h1>
          <p>Today&apos;s snapshot — cash, accounts, and profit at a glance.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-label">Today&apos;s sales</p>
          <p className="stat-value">Rs 0</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Cash in hand</p>
          <p className="stat-value tone-primary">Rs 0</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Customers owe</p>
          <p className="stat-value tone-grain">Rs 0</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Shop owes farmers</p>
          <p className="stat-value tone-consigned">Rs 0</p>
        </div>
      </div>
    </>
  );
}
