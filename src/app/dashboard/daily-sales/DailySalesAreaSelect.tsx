"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildDailySalesHref } from "./searchParamsHref";
import type { listAreas } from "@/modules/settings/areas.actions";

// Same pattern as customers' AreaSelect, pointed at Daily Sales' own
// href builder — reads the URL itself since a function can't cross
// the Server -> Client boundary as a prop.
export function DailySalesAreaSelect({
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
    router.push(buildDailySalesHref(current, { area: areaId || undefined, page: undefined }));
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
