export type ReportsHistorySearchParams = {
  from?: string;
  to?: string;
};

export function buildReportsHistoryHref(
  current: ReportsHistorySearchParams,
  overrides: Partial<ReportsHistorySearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);

  const qs = params.toString();
  return `/dashboard/reports-history${qs ? `?${qs}` : ""}`;
}
