import { Prisma } from "@prisma/client";

// Server Actions can only return plain objects to Client Components —
// Prisma's Decimal fields must be converted to numbers before
// crossing that boundary. Shallow (top-level fields only) — for a
// row with nested Decimals (e.g. a customer's accounts array), map
// this over each nested object explicitly rather than expecting one
// call to walk the whole tree; see getCustomer/listCustomers for the
// pattern.
export function serializeDecimals<T extends Record<string, unknown>>(row: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = value instanceof Prisma.Decimal ? Number(value) : value;
  }
  return result as T;
}
