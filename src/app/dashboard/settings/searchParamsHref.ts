// Settings is tab-based — one section visible at a time, same "real
// ?tab= navigation" pattern as Products/Expenses/Reports, rather than
// stacking every list on one long scrolling page.
export type SettingsSearchParams = {
  tab?: string;
};

export function buildSettingsHref(
  current: SettingsSearchParams,
  overrides: Partial<SettingsSearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.tab) params.set("tab", merged.tab);

  const qs = params.toString();
  return `/dashboard/settings${qs ? `?${qs}` : ""}`;
}
