import Link from "next/link";

export function DailySalesHeader() {
  return (
    <div className="page-head">
      <div>
        <h1>Daily sales</h1>
        <p>One screen for every sale — find or create the customer, add items, submit.</p>
      </div>
      <Link href="/dashboard/daily-sales/new" className="btn btn-primary">
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        New sale
      </Link>
    </div>
  );
}
