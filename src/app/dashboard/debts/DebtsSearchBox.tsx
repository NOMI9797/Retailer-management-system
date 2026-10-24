"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildDebtsHref } from "./searchParamsHref";

// Same pattern as DailySalesSearchBox — pushes ?search into the URL
// (keeping the current group/tab/product) so the Udhaar page's server
// components re-render the active table filtered to matching rows.
export function DebtsSearchBox({ activeSearch, placeholder }: { activeSearch: string; placeholder: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(activeSearch);

  function submit() {
    if (draft === activeSearch) return;
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildDebtsHref({ ...current, search: draft.trim() || undefined }));
  }

  return (
    <div className="search-pill" style={{ marginBottom: 16, maxWidth: 360 }}>
      <svg className="icon" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
    </div>
  );
}
