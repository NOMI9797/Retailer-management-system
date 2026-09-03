"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/utils";
import type { listCategories, listProducts } from "../actions";

const LOW_STOCK_THRESHOLD = 5;

type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

// Pure display — products/categories arrive already filtered by the
// server (search params drive the query in the Server Component
// parent). This component only renders rows and reports filter
// changes upward; it never fetches data itself.
export function ProductTable({
  products,
  categories,
  activeCategory,
  activeSearch,
  onFilterChange,
  onEdit,
}: {
  products: Product[];
  categories: Category[];
  activeCategory: string;
  activeSearch: string;
  onFilterChange: (next: { category?: string; search?: string }) => void;
  onEdit?: (productId: string) => void;
}) {
  // Local echo of the search box so typing feels instant; the actual
  // server refetch is debounced via onFilterChange.
  const [searchDraft, setSearchDraft] = useState(activeSearch);

  return (
    <>
      <div className="filter-bar">
        <select
          value={activeCategory}
          onChange={(e) => onFilterChange({ category: e.target.value })}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="search">
          <svg className="icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search products…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onFilterChange({ search: searchDraft });
            }}
            onBlur={() => onFilterChange({ search: searchDraft })}
          />
        </div>
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
            {products.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={7}>No products found.</td>
              </tr>
            ) : (
              products.map((product) => {
                const quantity = Number(product.quantity);
                return (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>
                      <span className="cat-pill">{product.category.name}</span>
                    </td>
                    <td>{product.unit.name}</td>
                    <td>{formatMoney(Number(product.costPrice))}</td>
                    <td>{formatMoney(Number(product.sellPrice))}</td>
                    <td className={quantity <= LOW_STOCK_THRESHOLD ? "qty-low" : undefined}>
                      {quantity}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => onEdit?.(product.id)}>
                          <svg className="icon" viewBox="0 0 24 24">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
