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

// Balance sign convention used across Customer Accounts, Reports, and
// the Dashboard — kept in one place so it's never reimplemented per
// screen. Positive = customer owes shop. Negative = shop owes customer.
export function describeBalance(balance: number) {
  if (balance > 0) return { label: "Customer owes", amount: balance };
  if (balance < 0) return { label: "Shop owes", amount: Math.abs(balance) };
  return { label: "Settled", amount: 0 };
}
