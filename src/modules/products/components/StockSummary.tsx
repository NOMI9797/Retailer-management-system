// Small component showing the aggregate quantity for a grain product —
// reads like one simple stock number even though it's several batches
// underneath. Reusable later on the Dashboard.
export function StockSummary({
  totalRemaining,
  unitName,
}: {
  totalRemaining: number;
  unitName: string;
}) {
  return (
    <div className="grain-total">
      <p>Total remaining</p>
      <p>
        {totalRemaining} {unitName}
      </p>
    </div>
  );
}
