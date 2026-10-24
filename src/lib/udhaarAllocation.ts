// Spreads a customer's total Udhaar payments across their Udhaar
// entries, oldest entry first — the same "apply to the oldest open
// invoice" rule QuickBooks/Oracle use for a payment that isn't tied to
// one specific bill. The shopkeeper records one total ("Rs 8,000
// received"); which entries that clears is DERIVED here every time,
// never stored, so editing or deleting any entry or payment
// re-allocates everything consistently on the next read.
//
// Ties on the same timestamp break by id so the order is stable.
// Anything paid beyond the total of all charges comes back as
// `unapplied` (e.g. an old sale was deleted after it had been paid).
export type AllocatableCharge = { id: string; date: Date; amount: number };

export type Allocated<T extends AllocatableCharge> = T & { paid: number; remaining: number };

export function allocateOldestFirst<T extends AllocatableCharge>(
  charges: T[],
  totalPaid: number
): { charges: Allocated<T>[]; unapplied: number } {
  const ordered = [...charges].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));

  // Rounded to paisa at every step so float drift never leaves a
  // Rs 0.0000001 "remaining" on an entry that's really cleared.
  const round = (n: number) => Math.round(n * 100) / 100;
  let pool = round(Math.max(0, totalPaid));
  const allocated = ordered.map((charge) => {
    const paid = round(Math.min(charge.amount, pool));
    pool = round(pool - paid);
    return { ...charge, paid, remaining: round(charge.amount - paid) };
  });

  return { charges: allocated, unapplied: pool };
}
