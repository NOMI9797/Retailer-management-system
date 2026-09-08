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

// Parses a "YYYY-MM-DD" string (from a <input type="date">, a search
// param, etc.) as LOCAL calendar midnight for that day — the START of
// day/END of day pair every date-range filter in the app needs.
//
// This deliberately never goes through `new Date(dateStr)`: per the
// ECMAScript spec, a bare "YYYY-MM-DD" string parses as UTC midnight,
// not local midnight. In any timezone ahead of UTC (e.g. Pakistan,
// UTC+5), calling `.setHours(0,0,0,0)` on that UTC-midnight Date then
// shifts it backward to LOCAL midnight of the PREVIOUS UTC day — so a
// shopkeeper picking "8 September" silently ends up querying/storing
// against "7 September 19:00 UTC" instead of "8 September 00:00
// local." This bug shipped multiple times across daily-sales,
// expenses, and cash-flow before being centralized here — always
// parse a plain date string through this helper instead of
// `new Date(dateStr)` followed by setHours.
export function parseLocalDateStart(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function parseLocalDateEnd(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

// The inverse of parseLocalDateStart — reads a Date's LOCAL calendar
// components back out as "YYYY-MM-DD" (e.g. for building a link's
// ?date= query param from a stored DailyCashRegister.date). Never use
// `date.toISOString().slice(0, 10)` for this: it reads the date back
// in UTC, which silently reports the wrong calendar day in a timezone
// ahead of UTC — the exact bug this file's other helpers exist to
// avoid.
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Balance sign convention used across Customer Accounts, Reports, and
// the Dashboard — kept in one place so it's never reimplemented per
// screen. Positive = customer owes shop. Negative = shop owes customer.
export function describeBalance(balance: number) {
  if (balance > 0) return { label: "Customer owes", amount: balance };
  if (balance < 0) return { label: "Shop owes", amount: Math.abs(balance) };
  return { label: "Settled", amount: 0 };
}
