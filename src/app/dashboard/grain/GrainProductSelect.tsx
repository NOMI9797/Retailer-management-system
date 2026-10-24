"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildGrainHref } from "./searchParamsHref";

// The Grain tab's product picker — a dropdown in the page header (in
// place of the old row of product tabs). Picking a product navigates
// to it via ?product=, same as the tabs did. A deactivated product is
// still listed (marked Inactive) so it stays manageable.
export function GrainProductSelect({
  products,
  activeId,
}: {
  products: { id: string; name: string; isActive: boolean }[];
  activeId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = products.find((p) => p.id === activeId);

  function onChange(productId: string) {
    const current = Object.fromEntries(searchParams.entries());
    // A name search belongs to the product it was typed on.
    delete current.name;
    router.push(buildGrainHref(current, { product: productId }));
  }

  return (
    <div className="select-pill grain-product-select">
      <span>
        {active?.name ?? "Select grain"}
        {active && !active.isActive && " (Inactive)"}
      </span>
      <svg className="chev" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select
        value={activeId}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Grain product"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {!p.isActive ? " (Inactive)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
