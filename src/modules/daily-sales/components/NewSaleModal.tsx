"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NewSaleForm } from "./NewSaleForm";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import type { listProducts } from "@/modules/products/actions";

export function NewSaleModal({
  areas,
  accountTypes,
  products,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  accountTypes: Awaited<ReturnType<typeof listAccountTypes>>;
  products: Awaited<ReturnType<typeof listProducts>>["products"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        New sale
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
            <h2>New sale</h2>
            <p className="modal-sub">
              Find the customer first — line items only need a product, quantity, and price.
            </p>
            <NewSaleForm
              areas={areas}
              accountTypes={accountTypes}
              products={products}
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
