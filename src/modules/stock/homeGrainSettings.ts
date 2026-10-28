// Grain bought that's still at a customer's home is, for now, recorded
// as a quantity only — old records are being imported and their rates
// aren't known — so it carries no rate, no payment, and Rs 0 of stock
// value. Turn this on to record a rate and pay the customer again (the
// purchase path behind it — createDepositWithSettlement with atHome —
// is kept as it is).
// Plain module (no server / client marker) — used by both sides.
export const HOME_GRAIN_RATES_ENABLED = false;
