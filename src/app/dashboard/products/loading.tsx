// Shown instantly on click while the Server Component above streams
// in real data — matches the page's shell/tabs/table layout so the
// swap-in doesn't jump. Next.js renders this automatically for any
// route with a page.tsx that awaits data (see Next's loading.tsx
// convention); no wiring needed beyond this file existing.
export default function ProductsLoading() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Product management</h1>
          <p>Everything the shop sells — simple stock and grain, tracked separately.</p>
        </div>
        <button className="btn btn-primary" disabled>
          <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add product
        </button>
      </div>

      <div className="tabs">
        <span className="tab active">Simple stock</span>
        <span className="tab">Grain stock</span>
      </div>

      <div className="filter-bar">
        <div className="skeleton" style={{ width: 140, height: 34 }} />
        <div className="skeleton" style={{ width: 280, height: 34 }} />
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Cost price</th>
              <th>Sell price</th>
              <th>Quantity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((i) => (
              <tr key={i}>
                <td colSpan={7}>
                  <div className="skeleton" style={{ width: "100%", height: 18 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
