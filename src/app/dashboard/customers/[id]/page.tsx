import { Suspense } from "react";
import Link from "next/link";
import { getCustomer } from "@/modules/customers/actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { CustomerAccountsList } from "./CustomerAccountsList";

// Static shell (back link) instant, the actual customer + ledger data
// streams in behind its own Suspense boundary — same shape as every
// other detail page in the app.
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href="/dashboard/customers" className="btn-ghost btn" style={{ marginBottom: 12 }}>
            ← Back to Customers
          </Link>
        </div>
      </div>

      <Suspense fallback={<PageLoader label="Loading customer…" />}>
        <CustomerDetail id={id} />
      </Suspense>
    </div>
  );
}

async function CustomerDetail({ id }: { id: string }) {
  const customer = await getCustomer(id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{customer.name}</h1>
          <p>
            {customer.phone || "No phone"}
            {" · "}
            {customer.area?.name || "No area"}
          </p>
          {customer.notes && (
            <p style={{ marginTop: 4, fontStyle: "italic" }}>{customer.notes}</p>
          )}
        </div>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "20px 0 12px" }}>Accounts</h2>
      <CustomerAccountsList accounts={customer.accounts} />
    </>
  );
}
