"use client";

import { useRouter } from "next/navigation";
import { buildCustomerDetailHref } from "./searchParamsHref";

// One grain's records on whichever tab is open — kept in the URL
// (?grain=) so switching tabs keeps it.
export function GrainFilter({
  customerId,
  tab,
  grain,
  grains,
}: {
  customerId: string;
  tab: string;
  grain?: string;
  grains: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <select
      value={grain ?? ""}
      onChange={(e) => router.push(buildCustomerDetailHref(customerId, { tab, grain: e.target.value || undefined }))}
      aria-label="Filter by grain"
      style={{ width: "auto", minWidth: 160, marginLeft: "auto", alignSelf: "center" }}
    >
      <option value="">All grains</option>
      {grains.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
