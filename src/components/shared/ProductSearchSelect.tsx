"use client";

import { useMemo, useRef, useState } from "react";

export type ProductOption = { id: string; label: string };

// A product dropdown you can type into: the list narrows to names
// containing what's typed (any word order), arrow keys + Enter pick,
// Escape closes. Shows the picked product's name when not typing. A
// hidden required input keeps the form's "pick a product" check.
export function ProductSearchSelect({
  options,
  value,
  onChange,
  placeholder = "Search product…",
}: {
  options: ProductOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) ?? null;

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return options;
    return options.filter((o) => {
      const name = o.label.toLowerCase();
      return words.every((w) => name.includes(w));
    });
  }, [options, query]);

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  function move(step: number) {
    const next = Math.max(0, Math.min(matches.length - 1, active + step));
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="product-search">
      <input
        type="text"
        value={open ? query : (selected?.label ?? "")}
        placeholder={selected ? selected.label : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (matches[active]) pick(matches[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        autoComplete="off"
      />
      {/* Keeps the browser's required check: no product picked → can't submit. */}
      <input className="product-search-required" tabIndex={-1} value={value} onChange={() => {}} required aria-hidden />
      {open && (
        <div className="product-search-list" ref={listRef}>
          {matches.length === 0 ? (
            <div className="product-search-empty">No product matches “{query}”</div>
          ) : (
            matches.map((o, k) => (
              <button
                key={o.id}
                type="button"
                className={`product-search-option${k === active ? " active" : ""}${o.id === value ? " selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(k)}
                onClick={() => pick(o.id)}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
