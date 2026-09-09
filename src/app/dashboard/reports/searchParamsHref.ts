// Same tab shape as Expenses/Register history — Daily/Monthly/Yearly/
// Seasonal share one page, one set of params, only the active tab's
// content renders. date/year/month/season are the period pickers for
// their respective tabs (only the ones relevant to the active tab are
// ever set at once).
export type ReportsSearchParams = {
  tab?: string;
  date?: string;
  year?: string;
  month?: string;
  season?: string;
};

export function buildReportsHref(
  current: ReportsSearchParams,
  overrides: Partial<ReportsSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.tab) params.set("tab", merged.tab);
  if (merged.date) params.set("date", merged.date);
  if (merged.year) params.set("year", merged.year);
  if (merged.month) params.set("month", merged.month);
  if (merged.season) params.set("season", merged.season);

  const qs = params.toString();
  return `/dashboard/reports${qs ? `?${qs}` : ""}`;
}
