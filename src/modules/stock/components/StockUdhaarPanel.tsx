import type { getStockUdhaarSummary } from "../actions";

type Entry = Awaited<ReturnType<typeof getStockUdhaarSummary>>[number];

// Outstanding Stock Udhaar — a QUANTITY obligation the shop owes a
// customer (grain sold from their deposit before it was purchased/
// settled), never money. Pure display — the data arrives as a prop
// from a Server Component, same pattern as every other list in the
// app. Used both shop-wide (Grain page) and scoped to one customer
// (customer detail page), depending on what getStockUdhaarSummary was
// called with.
export function StockUdhaarPanel({
  entries,
  showCustomer = true,
  showProduct = true,
  emptyLabel = "No outstanding Stock Udhaar.",
}: {
  entries: Entry[];
  showCustomer?: boolean;
  // Off when the table is already scoped to one product (e.g. the
  // Grain page's per-product Shop Udhaar subtab) — the column would
  // otherwise just repeat the same product name on every row.
  showProduct?: boolean;
  emptyLabel?: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="panel">
        <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            {showCustomer && <th>Customer</th>}
            {showProduct && <th>Product</th>}
            <th>Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.customerId}:${entry.productId}`}>
              {showCustomer && <td>{entry.customerName}</td>}
              {showProduct && <td>{entry.productName}</td>}
              <td>
                <span className="owner-tag owner-customer">{entry.quantity.toLocaleString()} owed</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
