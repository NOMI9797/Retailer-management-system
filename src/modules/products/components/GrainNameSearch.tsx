"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

// The Grain page's name search, sitting in the stat-card grid's free
// cell. It filters the Records tabs (GrainLedgerTabs) below — the two
// are linked through the ?name= URL param, written with
// history.replaceState so typing never refetches the page (Next keeps
// useSearchParams in sync with it).
export function GrainNameSearch() {
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(searchParams.get("name") ?? "");

  function update(value: string) {
    setDraft(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set("name", value);
    else params.delete("name");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="search-pill" style={{ maxWidth: "none", width: "100%" }}>
      <svg className="icon" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input type="text" placeholder="Search by name…" value={draft} onChange={(e) => update(e.target.value)} />
    </div>
  );
}
