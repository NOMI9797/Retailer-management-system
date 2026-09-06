import { Suspense } from "react";
import Link from "next/link";
import { getCustomer } from "@/modules/customers/actions";
import { getCustomerPurchaseHistory } from "@/modules/daily-sales/actions";
import { listCategories, listUnits, listProducts } from "@/modules/products/actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { CustomerAccountsList } from "./CustomerAccountsList";
import { PurchaseHistoryList } from "./PurchaseHistoryList";

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

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "28px 0 12px" }}>Purchase history</h2>
      <Suspense fallback={<PageLoader label="Loading purchase history…" />}>
        <PurchaseHistorySection customerId={id} />
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

// Purchase history is a genuinely separate query from the account
// ledger above (different tables entirely — DailySale/DailySaleItem
// vs. CustomerAccount/AccountTransaction), per the milestone's
// explicit "two distinct panels that must not be collapsed into one"
// requirement. Its own Suspense boundary means a slow purchase-history
// query never blocks the accounts panel from appearing, and vice versa.
async function PurchaseHistorySection({ customerId }: { customerId: string }) {
  const [sales, categories, units, simpleProducts, grainProducts] = await Promise.all([
    getCustomerPurchaseHistory(customerId),
    listCategories(),
    listUnits(),
    listProducts({ stockKind: "SIMPLE", pageSize: 500 }),
    listProducts({ stockKind: "GRAIN", pageSize: 500 }),
  ]);

  return (
    <PurchaseHistoryList
      sales={sales}
      products={[...simpleProducts.products, ...grainProducts.products]}
    />
  );
}
