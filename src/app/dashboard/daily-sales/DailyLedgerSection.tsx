import { listDailyLedger } from "@/modules/ledger/actions";
import { listProducts } from "@/modules/products/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney } from "@/lib/utils";
import { DailyLedgerColumns } from "./DailyLedgerColumns";
import type { DailySalesSearchParams } from "./searchParamsHref";

// Server side of the Daily sales page's Credit/Debit view: fetches the
// picked day's ledger (today by default) plus the product and bank-account
// lists EditSaleModal needs, shows the day's totals, and hands the rows
// to DailyLedgerColumns.
export async function DailyLedgerSection({ searchParams }: { searchParams: DailySalesSearchParams }) {
  const [ledger, simpleProducts, grainProducts, bankAccounts] = await Promise.all([
    listDailyLedger({
      fromDate: searchParams.date,
      toDate: searchParams.date,
      customerId: searchParams.customer,
      search: searchParams.search,
      areaId: searchParams.area,
      accountTypeId: searchParams.accountType,
    }),
    // includeInactive: EditSaleModal must still resolve a product an old
    // sale used, even if that product has since been deactivated.
    listProducts({ stockKind: "SIMPLE", pageSize: 500, includeInactive: true }),
    listProducts({ stockKind: "GRAIN", pageSize: 500, includeInactive: true }),
    listBankAccounts(),
  ]);

  const net = ledger.creditTotal - ledger.debitTotal;

  return (
    <>
      <div className="stat-grid customers-stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <p className="stat-label">Total credit (money in)</p>
          <p className="stat-value tone-primary">{formatMoney(ledger.creditTotal)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total debit (money out)</p>
          <p className="stat-value tone-consigned">{formatMoney(ledger.debitTotal)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{net > 0 ? "Net — Credit" : net < 0 ? "Net — Debit" : "Net — Balanced"}</p>
          <p className={`stat-value ${net < 0 ? "tone-consigned" : "tone-primary"}`}>{formatMoney(Math.abs(net))}</p>
        </div>
      </div>

      <DailyLedgerColumns
        credit={ledger.credit}
        debit={ledger.debit}
        creditTotal={ledger.creditTotal}
        debitTotal={ledger.debitTotal}
        products={[...simpleProducts.products, ...grainProducts.products]}
        bankAccounts={bankAccounts}
      />
    </>
  );
}
