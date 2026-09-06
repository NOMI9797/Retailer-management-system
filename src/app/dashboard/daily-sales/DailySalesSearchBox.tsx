"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildDailySalesHref } from "./searchParamsHref";

// Same pattern as CustomerSearchBox — filters Sales history by the
// buyer's name so a shopkeeper can instantly pull up what a specific
// customer bought without leaving this page.
export function DailySalesSearchBox({ activeSearch }: { activeSearch: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(activeSearch);

  function submit() {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildDailySalesHref(current, { search: draft || undefined, page: undefined }));
  }

  return (
    <div className="search-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        type="text"
        placeholder="Search by customer name…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
    </div>
  );
}
