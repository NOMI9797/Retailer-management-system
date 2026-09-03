import { PageLoader } from "@/components/shared/PageLoader";

// Shown the instant the route is clicked, before page.tsx itself has
// resolved — this is what closes the gap between click and anything
// appearing at all. Once page.tsx starts streaming, its own nested
// Suspense boundaries (see ProductsHeader/CategoryFilterBar/
// SimpleStockTable/GrainStockPanel) take over per-section.
export default function ProductsLoading() {
  return <PageLoader label="Loading products…" />;
}
