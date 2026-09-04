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

  return (
    <select value={activeArea} onChange={(e) => onChange(e.target.value)}>
      <option value="">All areas</option>
      {areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
