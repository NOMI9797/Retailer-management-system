import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number | string) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n);
}

// Pinned to a fixed locale/timezone for the same reason formatMoney
// is — an unqualified toLocaleDateString() renders using whatever
// locale the runtime happens to have, which differs between the
// server (system locale) and the browser (user's locale). In a
// Client Component that mismatch produces a React hydration error
// since the server-rendered HTML and the client's first render
// disagree on the text. Always go through this helper instead of
// calling toLocaleDateString() directly on a date shown in the UI.
export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

// Balance sign convention used across Customer Accounts, Reports, and
// the Dashboard — kept in one place so it's never reimplemented per
// screen. Positive = customer owes shop. Negative = shop owes customer.
export function describeBalance(balance: number) {
  if (balance > 0) return { label: "Customer owes", amount: balance };
  if (balance < 0) return { label: "Shop owes", amount: Math.abs(balance) };
  return { label: "Settled", amount: 0 };
}
