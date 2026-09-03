"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditProductModal } from "./EditProductModal";
import type { listProducts, listCategories, listUnits } from "../actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];
type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];

// The one client leaf per row — owns its own open/close state
// locally. Rendered directly by SimpleStockTable (a Server
// Component), which already has the full product/categories/units in
// scope, so they pass straight through as props with no extra fetch.
export function EditProductButton({
  product,
  categories,
  units,
}: {
  product: Product;
  categories: Category[];
  units: Unit[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>

      {open && (
        <EditProductModal
          product={product}
          categories={categories}
          units={units}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
