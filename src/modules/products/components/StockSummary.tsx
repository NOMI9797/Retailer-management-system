// Own/Customer/Total/Udhaar stock figures for one grain product —
// never conflated with each other: Stock Udhaar is a QUANTITY
// obligation (grain sold before it was settled with the depositing
// customer). Money owed to customers for already-settled, Credit-paid
// grain now lives on the Debts page's Shop (Udhaar) → Grain Udhaar
// subtab instead of here, alongside the shop's other Udhaar buckets
// (see ShopGrainUdhaarTable) — this card kept duplicating that same
// figure right next to a purely physical-stock summary. Uses the
// app's standard .stat-grid/.stat-card pattern (see
// ProductsStatRow.tsx, DebtSummaryCards.tsx) rather than a bespoke
// strip, so this reads like every other stat row in the app instead
// of a one-off widget.
export function StockSummary({
  totalRemaining,
  unitName,
  ownAvailable,
  customerClaim,
  stockUdhaarOutstanding,
  pooled,
}: {
  totalRemaining: number;
  unitName: string;
  ownAvailable: number;
  customerClaim: number;
  stockUdhaarOutstanding: number;
  pooled: { quantity: number; isProfit: boolean; displayValue: number };
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
        <p className="stat-label">Pooled stock</p>
        <p className="stat-value tone-grain">
          {pooled.quantity} {unitName}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">{pooled.isProfit ? "Profit" : "Stock value"}</p>
        <p className={`stat-value${pooled.isProfit ? " tone-primary" : ""}`}>
          Rs {pooled.displayValue.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
