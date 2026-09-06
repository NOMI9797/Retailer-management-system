import { NewSaleModal } from "@/modules/daily-sales/components/NewSaleModal";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import type { listProducts } from "@/modules/products/actions";

export function DailySalesHeader({
  areas,
  accountTypes,
  products,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  accountTypes: Awaited<ReturnType<typeof listAccountTypes>>;
  products: Awaited<ReturnType<typeof listProducts>>["products"];
}) {
  return (
    <div className="page-head">
      <div>
        <h1>Daily sales</h1>
        <p>One screen for every sale — find or create the customer, add items, submit.</p>
      </div>
      <NewSaleModal areas={areas} accountTypes={accountTypes} products={products} />
    </div>
  );
}
