"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildDailySalesHref } from "./searchParamsHref";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";

// Filters Sales history to customers holding a given account type
// (Regular/Udhaar/Consignment/...) — purely a lookup aid, same as the
// area filter; account types stay static categorization elsewhere.
export function DailySalesAccountTypeSelect({
  accountTypes,
  activeAccountType,
}: {
  accountTypes: Awaited<ReturnType<typeof listAccountTypes>>;
  activeAccountType: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(accountTypeId: string) {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildDailySalesHref(current, { accountType: accountTypeId || undefined, page: undefined }));
  }

  const activeName = accountTypes.find((t) => t.id === activeAccountType)?.name ?? "All account types";

  return (
    <div className="select-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
      </svg>
      <span>{activeName}</span>
      <svg className="chev" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select value={activeAccountType} onChange={(e) => onChange(e.target.value)}>
        <option value="">All account types</option>
        {accountTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
