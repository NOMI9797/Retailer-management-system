import { listBankAccountTransactions } from "@/modules/settings/bankAccounts.actions";
import { BankAccountTransactionsList } from "./BankAccountTransactionsList";
import type { BankAccountsSearchParams } from "./searchParamsHref";

// Server Component: does the actual per-navigation fetch (the merged
// feed across every table that carries a bankAccountId — see
// listBankAccountTransactions) and hands it to
// BankAccountTransactionsList, the client leaf that owns Delete's
// confirm state — same split SalesHistoryTable/SalesHistoryList
// follows.
export async function BankAccountTransactionsTable({ searchParams }: { searchParams: BankAccountsSearchParams }) {
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const result = await listBankAccountTransactions({
    bankAccountId: searchParams.bankAccount,
    fromDate: searchParams.from,
    toDate: searchParams.to,
    page,
  });

  return <BankAccountTransactionsList result={result} searchParams={searchParams} />;
}
