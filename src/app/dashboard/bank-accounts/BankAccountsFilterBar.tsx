import { BankAccountSelect } from "./BankAccountSelect";
import { BankAccountsDateRange } from "./BankAccountsDateRange";
import type { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import type { BankAccountsSearchParams } from "./searchParamsHref";

// Bank account + date range — narrows the combined transaction feed
// below, same "pill-filter-bar" shape Daily Sales' own filter bar
// uses.
export function BankAccountsFilterBar({
  searchParams,
  bankAccounts,
}: {
  searchParams: BankAccountsSearchParams;
  bankAccounts: Awaited<ReturnType<typeof listBankAccounts>>;
}) {
  return (
    <div className="pill-filter-bar">
      <BankAccountSelect bankAccounts={bankAccounts} activeBankAccount={searchParams.bankAccount ?? ""} />
      <BankAccountsDateRange activeFrom={searchParams.from ?? ""} activeTo={searchParams.to ?? ""} />
    </div>
  );
}
