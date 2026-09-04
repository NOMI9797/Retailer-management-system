import { AddCustomerModal } from "@/modules/customers/components/AddCustomerModal";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";

export function CustomersHeader({
  areas,
  accountTypes,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  accountTypes: Awaited<ReturnType<typeof listAccountTypes>>;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>Customers</h1>
        <p>Every customer's identity, area, and linked accounts — one record, no duplication.</p>
      </div>
      <AddCustomerModal areas={areas} accountTypes={accountTypes} />
    </div>
  );
}
