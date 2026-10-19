import { Suspense } from "react";
import { PageLoader } from "@/components/shared/PageLoader";
import { ReceiptsDatePicker } from "./ReceiptsDatePicker";
import { ReceiptsListSection } from "./ReceiptsListSection";
import { PrinterPicker } from "@/modules/printing/components/PrinterPicker";
import { todayDateString, type ReceiptsSearchParams } from "./searchParamsHref";

// One day's receipts (Daily Sales only, v1) — every visit that
// generated a receipt, with Edit/Delete scoped to just that one
// receipt (see updateReceipt/deleteReceipt), and a drill-down to full
// detail. The eventual printer integration hangs off the detail page.
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<ReceiptsSearchParams>;
}) {
  const params = await searchParams;
  const date = params.date || todayDateString();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Receipts</h1>
          <p>Every receipt generated that day — view, edit, or delete.</p>
        </div>
      </div>

      <div className="filter-bar" style={{ justifyContent: "space-between" }}>
        <ReceiptsDatePicker activeDate={date} />
        <PrinterPicker />
      </div>

      <Suspense key={date} fallback={<PageLoader label="Loading receipts…" />}>
        <ReceiptsListSection date={date} />
      </Suspense>
    </div>
  );
}
