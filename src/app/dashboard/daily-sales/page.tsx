import { Suspense } from "react";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { DailySalesHeader } from "./DailySalesHeader";
import { DailySalesFilterBar } from "./DailySalesFilterBar";
import { DailyLedgerSection } from "./DailyLedgerSection";
import type { DailySalesSearchParams } from "./searchParamsHref";

// Header, filters, then the day's credit/debit/net totals and the
// Daily Credit (money in) and Daily Debit (money out) columns side by
// side. With no date picked it shows today. Entry forms live on
// /daily-sales/new. Areas/account types are cached lookups fetched here
// so the filter bar renders instantly; the ledger streams in behind its
// own Suspense boundary.
export default async function DailySalesPage({
  searchParams,
}: {
  searchParams: Promise<DailySalesSearchParams>;
}) {
  const params = await searchParams;
  const [areas, accountTypes] = await Promise.all([listAreas(), listAccountTypes()]);

  return (
    <div>
      <DailySalesHeader />

      <DailySalesFilterBar searchParams={params} areas={areas} accountTypes={accountTypes} />

      <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading the day's credit and debit…" />}>
        <DailyLedgerSection searchParams={params} />
      </Suspense>
    </div>
  );
}
