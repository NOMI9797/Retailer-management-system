"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildBankAccountsHref } from "./searchParamsHref";
import type { listBankAccounts } from "@/modules/settings/bankAccounts.actions";

// Same select-pill pattern as Daily Sales' own AreaSelect — reads the
// URL itself since a function can't cross the Server -> Client
// boundary as a prop.
export function BankAccountSelect({
  bankAccounts,
  activeBankAccount,
}: {
  bankAccounts: Awaited<ReturnType<typeof listBankAccounts>>;
  activeBankAccount: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(bankAccountId: string) {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildBankAccountsHref(current, { bankAccount: bankAccountId || undefined, page: undefined }));
  }

  const activeName = bankAccounts.find((a) => a.id === activeBankAccount)?.name ?? "All accounts";

  return (
    <div className="select-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <rect x="2.5" y="9" width="19" height="11" rx="1.5" />
        <path d="M4 9l8-5.5L20 9" />
      </svg>
      <span>{activeName}</span>
      <svg className="chev" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select value={activeBankAccount} onChange={(e) => onChange(e.target.value)}>
        <option value="">All accounts</option>
        {bankAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
