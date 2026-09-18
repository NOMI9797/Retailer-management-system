import { AddCustomerModal } from "@/modules/customers/components/AddCustomerModal";
import type { listAreas } from "@/modules/settings/areas.actions";

export function CustomersHeader({
  areas,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>Customers</h1>
        <p>Every customer's identity, area, and linked accounts — one record, no duplication.</p>
      </div>
      <AddCustomerModal areas={areas} />
    </div>
  );
}
