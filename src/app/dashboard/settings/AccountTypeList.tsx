import Link from "next/link";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { AccountTypeRowActions } from "@/modules/settings/components/AccountTypeRowActions";

type AccountType = Awaited<ReturnType<typeof listAccountTypes>>[number];

// Pure server-rendered list — the only client leaf is the row's
// activate/deactivate toggle (AccountTypeRowActions), same
// "push interactivity to the smallest leaf" pattern as Products.
export function AccountTypeList({ accountTypes }: { accountTypes: AccountType[] }) {
  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Tracks quantity</th>
            <th>Custom fields</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accountTypes.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={6}>No account types yet.</td>
            </tr>
          ) : (
            accountTypes.map((accountType) => (
              <tr key={accountType.id}>
                <td style={{ opacity: accountType.isActive ? 1 : 0.5 }}>
                  <Link
                    href={`/dashboard/settings/account-types/${accountType.id}`}
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    {accountType.name}
                  </Link>
                </td>
                <td>
                  <span className="cat-pill">{accountType.code}</span>
                </td>
                <td>{accountType.tracksQuantity ? "Yes" : "No"}</td>
                <td>{accountType.fields.length}</td>
                <td>
                  <span className="cat-pill">{accountType.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td>
                  <div className="row-actions">
                    <AccountTypeRowActions accountType={accountType} />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
