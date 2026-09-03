// Themed loading indicator — centered spinner in the shop's teal
// primary color, plus an optional label. Used inside Suspense
// fallbacks so only the data-dependent area of a page shows this,
// while the rest of the page (header, tabs, filters) stays on screen.
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="page-loader">
      <div className="page-loader-spinner" />
      <p>{label}</p>
    </div>
  );
}
