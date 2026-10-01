import { Suspense } from "react";
import Link from "next/link";
import { getBankAccountBalances, listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { formatMoney } from "@/lib/utils";
import { PageLoader } from "@/components/shared/PageLoader";
import { BankAccountsFilterBar } from "./BankAccountsFilterBar";
import { BankAccountTransactionsTable } from "./BankAccountTransactionsTable";
import type { BankAccountsSearchParams } from "./searchParamsHref";

// Every bank account with its live, stored running balance up top
// (queried fresh, same "never stale" treatment the Dashboard's
// balance cards get), then the combined transaction history below —
// every single row, across every feature in the app, where money
// moved through a bank account (sales, expenses, Udhaar repayments,
// grain settlements, loans — see listBankAccountTransactions),
// filterable by account and date range same as Sales History.
// Adding/renaming/deactivating an account still happens in Settings,
// same as every other shopkeeper-managed list.
export default async function BankAccountsPage({
  searchParams,
}: {
  searchParams: Promise<BankAccountsSearchParams>;
}) {
  const params = await searchParams;
  const [accounts, bankAccountsForFilter] = await Promise.all([getBankAccountBalances(), listBankAccounts()]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Bank accounts</h1>
          <p>How much money is in each bank account, based on every Account payment recorded against it.</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="panel">
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5, padding: "14px 20px" }}>
            No bank accounts yet. Add one in{" "}
            <Link href="/dashboard/settings?tab=bank-accounts">Settings → Bank accounts</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 22 }}>
            {accounts.map((account) => (
              <div className="stat-card" key={account.id}>
                <p className="stat-label">
                  {account.name}
                  {!account.isActive && " (inactive)"}
                </p>
                <p className={`stat-value ${account.currentBalance < 0 ? "tone-consigned" : "tone-primary"}`}>
                  {formatMoney(account.currentBalance)}
                </p>
              </div>
            ))}
          </div>

          <BankAccountsFilterBar searchParams={params} bankAccounts={bankAccountsForFilter} />

          <Suspense key={JSON.stringify(params)} fallback={<PageLoader label="Loading transactions…" />}>
            <BankAccountTransactionsTable searchParams={params} />
          </Suspense>
        </>
      )}
    </div>
  );
}
