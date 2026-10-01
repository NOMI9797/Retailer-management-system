import Link from "next/link";
import { listProducts } from "@/modules/products/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { NewSaleForm } from "@/modules/daily-sales/components/NewSaleForm";
import { UdhaarClearanceForm } from "@/modules/daily-sales/components/UdhaarClearanceForm";
import { StockFromCustomerForm } from "@/modules/daily-sales/components/StockFromCustomerForm";
import { buildNewSaleHref, type NewSalePageSearchParams } from "./searchParamsHref";

const TAB_META = {
  "new-sale": {
    title: "New sale",
    subtitle: "Find or create the customer, add items, then split the payment.",
  },
  "udhaar-clearance": {
    title: "Udhaar Clearance",
    subtitle: "Find a customer, see what they owe, and record a payment.",
  },
  "stock-from-customer": {
    title: "Buy/Keep Stock",
    subtitle: "Find a customer, see their grain deposits, settle one, or record a new drop-off.",
  },
} as const;
type Tab = keyof typeof TAB_META;

// A dedicated page rather than a modal — the sale form is expected to
// grow (more fields, richer item entry, maybe attachments) and a
// full-page layout has the room a fixed-width modal doesn't. Tab-based,
// same shape as Settings/Expenses/Reports: New Sale (the original
// form), Udhaar Clearance (find a customer, see their Udhaar
// borrowed/paid/remaining, record a payment), and Buy/Keep Stock
// (find a customer, see/settle their grain deposits, or record a new
// one — the same deposit/settlement flows the Grain page's per-product
// tabs use, just reachable customer-first from this one main screen;
// the tab's internal route value stays "stock-from-customer")
// share this one page.
export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<NewSalePageSearchParams>;
}) {
  const params = await searchParams;
  const tab: Tab = params.tab === "udhaar-clearance"
    ? "udhaar-clearance"
    : params.tab === "stock-from-customer"
      ? "stock-from-customer"
      : "new-sale";

  const [areas, accountTypes, simpleProducts, grainProducts, bankAccounts] = await Promise.all([
    listAreas(),
    listAccountTypes(),
    listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
    listProducts({ stockKind: "GRAIN", pageSize: 500 }),
    listBankAccounts(),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{TAB_META[tab].title}</h1>
          <p>{TAB_META[tab].subtitle}</p>
        </div>
      </div>

      <div className="tabs">
        <Link className={`tab${tab === "new-sale" ? " active" : ""}`} href={buildNewSaleHref({ tab: "new-sale" })}>
          New Sale
        </Link>
        <Link
          className={`tab${tab === "udhaar-clearance" ? " active" : ""}`}
          href={buildNewSaleHref({ tab: "udhaar-clearance" })}
        >
          Udhaar Clearance
        </Link>
        <Link
          className={`tab${tab === "stock-from-customer" ? " active" : ""}`}
          href={buildNewSaleHref({ tab: "stock-from-customer" })}
        >
          Buy/Keep Stock
        </Link>
      </div>

      <div className="panel" style={{ padding: 32 }}>
        {tab === "new-sale" ? (
          <NewSaleForm areas={areas} products={[...simpleProducts.products, ...grainProducts.products]} bankAccounts={bankAccounts} />
        ) : tab === "udhaar-clearance" ? (
          <UdhaarClearanceForm areas={areas} accountTypes={accountTypes} />
        ) : (
          <StockFromCustomerForm areas={areas} grainProducts={grainProducts.products} />
        )}
      </div>
    </div>
  );
}
