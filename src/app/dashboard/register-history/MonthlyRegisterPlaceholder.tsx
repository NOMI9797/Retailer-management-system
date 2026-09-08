// UI-only for now, per the "just UI, don't implement functionality"
// decision — Cash Flow doesn't have a monthly-level register concept
// yet (opening/expected/actual closing are all computed per calendar
// day). This tab exists so the shape is in place once that's built.
export function MonthlyRegisterPlaceholder() {
  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th style={{ textAlign: "right" }}>Opening</th>
            <th style={{ textAlign: "right" }}>Expected closing</th>
            <th style={{ textAlign: "right" }}>Actual closing</th>
            <th style={{ textAlign: "right" }}>Variance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className="empty-row">
            <td colSpan={6}>Monthly register isn&apos;t tracked yet — coming in a future update.</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
