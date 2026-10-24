"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";
import { buildNewSaleHref } from "./searchParamsHref";
import { ENTRIES } from "./entries";

type Result =
  | { kind: "ENTRY"; key: string; label: string; hint: string; href: string }
  | { kind: "CUSTOMER"; key: string; label: string; hint: string; href: string }
  | { kind: "DEALER"; key: string; label: string; hint: string; href: string };

// The New entry screen's one search box: "Who came, or what happened?"
// Typing a customer or dealer name opens their card (balances and the
// actions that fit them); typing a word like "rent" or "udhaar" jumps
// straight to that entry. Live search-as-you-type is genuine client
// state — the person card itself is server-rendered from ?customer /
// ?dealer. Press / anywhere on the screen to jump here; Enter picks the
// top result.
export function EntrySearch({ dealers }: { dealers: { id: string; name: string; type: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = query.trim().toLowerCase();
  const { customers, isLoading } = useCustomers(q.length >= 2 ? q : undefined);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo<Result[]>(() => {
    if (!q) return [];
    const words = q.split(/\s+/);
    const entryMatches: Result[] = ENTRIES.filter((e) => {
      const hay = `${e.title} ${e.keywords}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).map((e) => ({
      kind: "ENTRY",
      key: `e:${e.tab}`,
      label: e.title,
      hint: e.description,
      href: buildNewSaleHref({ tab: e.tab }),
    }));
    const people: Result[] =
      q.length >= 2
        ? [
            ...customers.slice(0, 6).map(
              (c): Result => ({
                kind: "CUSTOMER",
                key: `c:${c.id}`,
                label: c.name,
                hint: c.phone ?? "",
                href: buildNewSaleHref({ customer: c.id }),
              })
            ),
            ...dealers
              .filter((d) => d.name.toLowerCase().includes(q))
              .slice(0, 4)
              .map(
                (d): Result => ({
                  kind: "DEALER",
                  key: `d:${d.id}`,
                  label: d.name,
                  hint: d.type === "GRAIN" ? "Grain" : "Products",
                  href: buildNewSaleHref({ dealer: d.id }),
                })
              ),
          ]
        : [];
    // A name typed is the common case, so people come first.
    return [...people, ...entryMatches].slice(0, 10);
  }, [q, customers, dealers]);

  function go(result: Result | undefined) {
    if (!result) return;
    setQuery("");
    router.push(result.href);
  }

  return (
    <div className="entry-search">
      <div className="search-pill entry-search-pill">
        <svg className="icon" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          autoFocus
          placeholder="Who came, or what happened? — type a name, or rent, udhaar, cotton…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
        />
        <kbd className="entry-search-kbd">/</kbd>
      </div>

      {q && (
        <div className="entry-search-results panel">
          {results.length === 0 ? (
            <p className="entry-search-empty">
              {q.length >= 2 && isLoading ? "Searching…" : `Nothing matches "${query.trim()}".`}
            </p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.key}
                type="button"
                className={`entry-search-row${i === active ? " active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
              >
                <span className={`entry-search-tag tag-${r.kind.toLowerCase()}`}>
                  {r.kind === "ENTRY" ? "Action" : r.kind === "CUSTOMER" ? "Customer" : "Dealer"}
                </span>
                <span className="entry-search-label">{r.label}</span>
                <span className="entry-search-hint">{r.hint}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
