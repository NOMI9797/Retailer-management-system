import Link from "next/link";

// Minimal page-through control — used by both the Simple stock table
// and the Grain stock list once a shop has enough products to need
// more than one page. Pure <Link href> navigation (URL search params
// drive the page), so it's a plain Server Component with no client
// JS of its own.
export function Pagination({
  page,
  totalPages,
  totalCount,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  hrefFor: (page: number) => string;
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
        {page <= 1 ? (
          <button className="btn btn-ghost" disabled>
            Previous
          </button>
        ) : (
          <Link className="btn btn-ghost" href={hrefFor(page - 1)}>
            Previous
          </Link>
        )}
        <span>
          Page {page} of {totalPages}
        </span>
        {page >= totalPages ? (
          <button className="btn btn-ghost" disabled>
            Next
          </button>
        ) : (
          <Link className="btn btn-ghost" href={hrefFor(page + 1)}>
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
