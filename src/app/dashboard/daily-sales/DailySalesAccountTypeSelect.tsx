"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildDailySalesHref } from "./searchParamsHref";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";

// Filters Sales history to customers holding a given account type
// (Regular/Udhar/Consignment/...) — purely a lookup aid, same as the
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

  return (
    <select value={activeAccountType} onChange={(e) => onChange(e.target.value)}>
      <option value="">All account types</option>
      {accountTypes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
