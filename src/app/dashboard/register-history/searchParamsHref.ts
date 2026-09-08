export type RegisterHistorySearchParams = {
  tab?: string;
  from?: string;
  to?: string;
};

export function buildRegisterHistoryHref(
  current: RegisterHistorySearchParams,
  overrides: Partial<RegisterHistorySearchParams>
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.tab) params.set("tab", merged.tab);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);

  const qs = params.toString();
  return `/dashboard/register-history${qs ? `?${qs}` : ""}`;
}
