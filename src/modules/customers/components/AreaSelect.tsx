"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildCustomersHref } from "@/app/dashboard/customers/searchParamsHref";
import type { listAreas } from "@/modules/settings/areas.actions";

// Same pattern as products' CategorySelect — the one client leaf in
// the filter bar, reads the current URL itself since a function
// can't cross the Server -> Client boundary as a prop.
export function AreaSelect({
  areas,
  activeArea,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  activeArea: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(areaId: string) {
    const current = Object.fromEntries(searchParams.entries());
    router.push(buildCustomersHref(current, { area: areaId || undefined }));
  }

  const activeName = areas.find((a) => a.id === activeArea)?.name ?? "All areas";

  return (
    <div className="select-pill">
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M12 2.5a7 7 0 00-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 00-7-7z" />
        <circle cx="12" cy="9.5" r="2.3" />
      </svg>
      <span>{activeName}</span>
      <svg className="chev" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select value={activeArea} onChange={(e) => onChange(e.target.value)}>
        <option value="">All areas</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
