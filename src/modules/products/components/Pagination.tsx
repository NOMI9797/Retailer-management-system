// Minimal page-through control — used by both the Simple stock table
// and the Grain stock list once a shop has enough products to need
// more than one page.
export function Pagination({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 12,
        fontSize: 13,
        color: "var(--ink-muted)",
      }}
    >
      <span>{totalCount} total</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn btn-ghost"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="btn btn-ghost"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
