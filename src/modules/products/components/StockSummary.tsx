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
  stockValue,
  lentOut,
  atCustomerHomes = 0,
  borrowed,
  searchSlot,
}: {
  totalRemaining: number;
  unitName: string;
  ownAvailable: number;
  customerClaim: number;
  stockUdhaarOutstanding: number;
  pooled: { quantity: number; isProfit: boolean; displayValue: number };
  // Value of the shop's own grain on hand, at the rates it was bought at.
  stockValue: number;
  // Grain loans still to come back to the shop / still to give back.
  lentOut: number;
  // Bought but still at the seller's home — also Advance stock.
  atCustomerHomes?: number;
  borrowed: number;
  // Shown in the grid's free cell under Stock Udhaar (the Grain page's
  // name search).
  searchSlot?: React.ReactNode;
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
        <p className="stat-label">Stock value</p>
        <p className="stat-value">Rs {stockValue.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        {/* The shop's own grain that isn't here: lent out on grain loans
            (coming back), or bought but still at the seller's home (to
            pick up) — counted in Own stock and Stock value, not in
            Total physical. */}
        <p className="stat-label">Advance stock</p>
        <p className={`stat-value${lentOut || atCustomerHomes ? " tone-grain" : ""}`}>
          {Math.round((lentOut + atCustomerHomes) * 1000) / 1000} {unitName}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
          {atCustomerHomes > 0
            ? `Lent ${lentOut} · At customers' homes ${atCustomerHomes}`
            : "Shop's grain lent out"}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Borrowed (loans)</p>
        <p className={`stat-value${borrowed ? " tone-consigned" : ""}`}>
          {borrowed} {unitName}
        </p>
      </div>
      {searchSlot && <div className="grain-search-cell">{searchSlot}</div>}
    </div>
  );
}
