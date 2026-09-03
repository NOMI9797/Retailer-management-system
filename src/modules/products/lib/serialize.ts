import { Prisma } from "@prisma/client";

// Server Actions can only return plain objects to Client Components —
// Prisma's Decimal fields must be converted to numbers before
// crossing that boundary. Kept in one place rather than reimplemented
// per action, same reasoning as describeBalance() in lib/utils.ts.
export function serializeDecimals<T extends Record<string, unknown>>(row: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = value instanceof Prisma.Decimal ? Number(value) : value;
  }
  return result as T;
}
