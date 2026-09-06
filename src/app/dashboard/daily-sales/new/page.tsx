import { listProducts } from "@/modules/products/actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { NewSaleForm } from "@/modules/daily-sales/components/NewSaleForm";

// A dedicated page rather than a modal — the sale form is expected to
// grow (more fields, richer item entry, maybe attachments) and a
// full-page layout has the room a fixed-width modal doesn't.
export default async function NewSalePage() {
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
          <h1>New sale</h1>
          <p>Find or create the customer, add items, then split the payment.</p>
        </div>
      </div>

      <div className="panel" style={{ padding: 32 }}>
        <NewSaleForm
          areas={areas}
          accountTypes={accountTypes}
          products={[...simpleProducts.products, ...grainProducts.products]}
        />
      </div>
    </div>
  );
}
