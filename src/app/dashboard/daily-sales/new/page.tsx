import Link from "next/link";
import { listProducts } from "@/modules/products/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { NewSaleForm } from "@/modules/daily-sales/components/NewSaleForm";
import { UdhaarClearanceForm } from "@/modules/daily-sales/components/UdhaarClearanceForm";
import { buildNewSaleHref, type NewSalePageSearchParams } from "./searchParamsHref";

// A dedicated page rather than a modal — the sale form is expected to
// grow (more fields, richer item entry, maybe attachments) and a
// full-page layout has the room a fixed-width modal doesn't. Tab-based,
// same shape as Settings/Expenses/Reports: New Sale (the original
// form) and Udhaar Clearance (find a customer, see their Udhaar
// borrowed/paid/remaining, record a payment) share this one page.
export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<NewSalePageSearchParams>;
}) {
  const params = await searchParams;
  const tab = params.tab === "udhaar-clearance" ? "udhaar-clearance" : "new-sale";

  const [areas, accountTypes, simpleProducts, grainProducts] = await Promise.all([
    listAreas(),
    listAccountTypes(),
    listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
    listProducts({ stockKind: "GRAIN", pageSize: 500 }),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{tab === "new-sale" ? "New sale" : "Udhaar Clearance"}</h1>
          <p>
            {tab === "new-sale"
              ? "Find or create the customer, add items, then split the payment."
              : "Find a customer, see what they owe, and record a payment."}
          </p>
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
      </div>

      <div className="panel" style={{ padding: 32 }}>
        {tab === "new-sale" ? (
          <NewSaleForm areas={areas} products={[...simpleProducts.products, ...grainProducts.products]} />
        ) : (
          <UdhaarClearanceForm areas={areas} accountTypes={accountTypes} />
        )}
      </div>
    </div>
  );
}
