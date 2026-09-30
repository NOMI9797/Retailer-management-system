// Own/Customer/Total/Udhaar stock figures for one grain product, plus
// money owed to customers — five figures that must never be conflated
// with each other: Stock Udhaar is a QUANTITY obligation (grain sold
// before it was settled with the depositing customer); "Owed to
// customers" is a MONEY obligation (grain already settled — ownership
// moved, the shopkeeper agreed a rate — but not yet paid for, because
// it was bought on Credit). Uses the app's standard
// .stat-grid/.stat-card pattern (see ProductsStatRow.tsx,
// DebtSummaryCards.tsx) rather than a bespoke strip, so this reads
// like every other stat row in the app instead of a one-off widget.
export function StockSummary({
  totalRemaining,
  unitName,
  ownAvailable,
  customerClaim,
  stockUdhaarOutstanding,
  moneyOwedToCustomers,
}: {
  totalRemaining: number;
  unitName: string;
  ownAvailable: number;
  customerClaim: number;
  stockUdhaarOutstanding: number;
  moneyOwedToCustomers: number;
}) {
  return (
    <div className="stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">Own stock</p>
        <p className="stat-value tone-primary">
          {ownAvailable} {unitName}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Customer stock</p>
        <p className="stat-value tone-grain">
          {customerClaim} {unitName}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Total physical</p>
        <p className="stat-value">
          {totalRemaining} {unitName}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Stock Udhaar</p>
        <p className={`stat-value${stockUdhaarOutstanding ? " tone-consigned" : ""}`}>
          {stockUdhaarOutstanding} {unitName}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Owed to customers</p>
        <p className={`stat-value${moneyOwedToCustomers ? " tone-consigned" : ""}`}>
          Rs {moneyOwedToCustomers.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
