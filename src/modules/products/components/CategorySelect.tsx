"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildProductsHref } from "@/app/dashboard/products/searchParamsHref";
import type { listCategories } from "../actions";

// The one client leaf in the filter bar — a real <select> needs an
// onChange handler, which requires "use client". Reads the current
// URL itself (rather than receiving a prebuilt href function — a
// Server Component parent can't pass a function as a prop) and
// navigates via router.push when changed.
export function CategorySelect({
  categories,
  activeCategory,
}: {
  categories: Awaited<ReturnType<typeof listCategories>>;
  activeCategory: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(categoryId: string) {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildProductsHref(current, { category: categoryId || undefined }));
  }

  const activeName = categories.find((c) => c.id === activeCategory)?.name ?? "All categories";

  return (
    <div className="select-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
      </svg>
      <span>{activeName}</span>
      <svg className="chev" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select value={activeCategory} onChange={(e) => onChange(e.target.value)}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
