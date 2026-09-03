"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductForm } from "@/modules/products/components/ProductForm";
import { ProductTable } from "@/modules/products/components/ProductTable";
import { GrainBatchList } from "@/modules/products/components/GrainBatchList";
import { EditProductModal } from "@/modules/products/components/EditProductModal";
import { Pagination } from "@/modules/products/components/Pagination";
import type {
  listCategories,
  listUnits,
  listProducts,
  listGrainProductDetailsForShop,
} from "@/modules/products/actions";

type Tab = "simple" | "grain";
type Category = Awaited<ReturnType<typeof listCategories>>[number];
type Unit = Awaited<ReturnType<typeof listUnits>>[number];
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];
type GrainDetails = Awaited<ReturnType<typeof listGrainProductDetailsForShop>>["details"];
type PageInfo = { page: number; totalPages: number; totalCount: number };

// The only client-side state here is UI state (active tab, which
// modal is open, pagination in the URL) — all data arrives as props
// from the Server Component parent. Adding a product shows
// immediately via useOptimistic while the real write + refresh
// happens in the background; other writes call a Server Action then
// router.refresh().
export function ProductsClient({
  categories,
  units,
  simpleProducts,
  simplePagination,
  grainProducts,
  grainDetails,
  grainPagination,
  activeCategory,
  activeSearch,
}: {
  categories: Category[];
  units: Unit[];
  simpleProducts: Product[];
  simplePagination: PageInfo;
  grainProducts: Product[];
  grainDetails: GrainDetails;
  grainPagination: PageInfo;
  activeCategory: string;
  activeSearch: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("simple");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Optimistic list: a just-added product appears instantly, tagged
  // pending, then reconciles to the real server list once
  // router.refresh() re-runs the page. Reverts automatically if the
  // action throws (React discards the optimistic entry on error).
  const [optimisticProducts, addOptimisticProduct] = useOptimistic(
    simpleProducts,
    (state, newProduct: Product) => [newProduct, ...state]
  );

  function updateFilters(next: { category?: string; search?: string; page?: number }) {
    const params = new URLSearchParams();
    const category = next.category ?? activeCategory;
    const search = next.search ?? activeSearch;
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    router.push(`/dashboard/products${params.toString() ? `?${params}` : ""}`);
  }

  function updateGrainPage(page: number) {
    const params = new URLSearchParams();
    if (page > 1) params.set("grainPage", String(page));
    router.push(`/dashboard/products${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Product management</h1>
          <p>Everything the shop sells — simple stock and grain, tracked separately.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add product
        </button>
      </div>

      <div className="tabs">
        <button className={`tab${tab === "simple" ? " active" : ""}`} onClick={() => setTab("simple")}>
          Simple stock
        </button>
        <button className={`tab${tab === "grain" ? " active" : ""}`} onClick={() => setTab("grain")}>
          Grain stock
        </button>
      </div>

      {tab === "simple" ? (
        <>
          <ProductTable
            products={optimisticProducts}
            categories={categories}
            activeCategory={activeCategory}
            activeSearch={activeSearch}
            onFilterChange={updateFilters}
            onEdit={(productId) => {
              const product = optimisticProducts.find((p) => p.id === productId);
              if (product) setEditingProduct(product);
            }}
          />
          <Pagination
            page={simplePagination.page}
            totalPages={simplePagination.totalPages}
            totalCount={simplePagination.totalCount}
            onPageChange={(page) => updateFilters({ page })}
          />
        </>
      ) : (
        <>
          <div className="panel">
            {grainProducts.length === 0 ? (
              <p style={{ padding: 16, color: "var(--ink-muted)", fontSize: 13.5 }}>
                No grain products yet — add one to start tracking batches.
              </p>
            ) : (
              grainProducts.map((product) => (
                <GrainBatchList key={product.id} product={product} detail={grainDetails[product.id]} />
              ))
            )}
          </div>
          <Pagination
            page={grainPagination.page}
            totalPages={grainPagination.totalPages}
            totalCount={grainPagination.totalCount}
            onPageChange={updateGrainPage}
          />
        </>
      )}

      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add product</h2>
            <p className="modal-sub">Choose the stock type — this changes which fields you fill in.</p>
            <ProductForm
              categories={categories}
              units={units}
              onOptimisticAdd={(product) => {
                startTransition(() => addOptimisticProduct(product));
              }}
              onSaved={() => {
                setShowAddModal(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          categories={categories}
          units={units}
          onClose={() => setEditingProduct(null)}
          onSaved={() => {
            setEditingProduct(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
