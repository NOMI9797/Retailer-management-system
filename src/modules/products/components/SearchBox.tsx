"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildProductsHref } from "@/app/dashboard/products/searchParamsHref";

// The other client leaf in the filter bar — a controlled text input
// needs local state for the draft value so typing feels instant,
// while the actual navigation (and thus the server refetch) only
// fires on Enter or blur. Reads the current URL itself rather than
// receiving a prebuilt href function (can't cross the Server ->
// Client boundary as a prop).
export function SearchBox({ activeSearch }: { activeSearch: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(activeSearch);

  function submit() {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildProductsHref(current, { search: draft || undefined }));
  }

  return (
    <div className="search">
      <svg className="icon" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        type="text"
        placeholder="Search products…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
    </div>
  );
}
