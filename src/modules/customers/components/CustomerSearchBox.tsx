"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildCustomersHref } from "@/app/dashboard/customers/searchParamsHref";

// Same pattern as products' SearchBox.
export function CustomerSearchBox({ activeSearch }: { activeSearch: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(activeSearch);

  function submit() {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildCustomersHref(current, { search: draft || undefined }));
  }

  return (
    <div className="search-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        type="text"
        placeholder="Search by name or phone…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
    </div>
  );
}
