import { Suspense } from "react";
import Link from "next/link";
import { getAccountType } from "@/modules/settings/accountTypes.actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { AccountTypeFieldList } from "./AccountTypeFieldList";

// Same shape as the rest of the app: static shell (back link, title)
// renders immediately, the actual field list streams in behind its
// own Suspense boundary.
export default async function AccountTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href="/dashboard/settings" className="btn-ghost btn" style={{ marginBottom: 12 }}>
            ← Back to Settings
          </Link>
        </div>
      </div>

      <Suspense fallback={<PageLoader label="Loading account type…" />}>
        <AccountTypeDetail id={id} />
      </Suspense>
    </div>
  );
}

async function AccountTypeDetail({ id }: { id: string }) {
  const accountType = await getAccountType(id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{accountType.name}</h1>
          <p>
            Code: <span className="cat-pill">{accountType.code}</span>
            {" · "}
            {accountType.tracksQuantity ? "Tracks quantity" : "Money only"}
            {" · "}
            {accountType.isActive ? "Active" : "Inactive"}
          </p>
        </div>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "20px 0 12px" }}>Custom fields</h2>
      <AccountTypeFieldList accountTypeId={accountType.id} fields={accountType.fields} />
    </>
  );
}
