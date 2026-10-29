// Own/Customer/Total/Udhaar stock figures for one grain product —
// never conflated with each other: Stock Udhaar is a QUANTITY
// obligation (grain sold before it was settled with the depositing
// customer). Money owed to customers for already-settled, Credit-paid
// grain now lives on the Debts page's Shop (Udhaar) → Grain Udhaar
// subtab instead of here, alongside the shop's other Udhaar buckets
// (see ShopGrainUdhaarTable) — this card kept duplicating that same
// figure right next to a purely physical-stock summary. Uses the
// app's standard .stat-grid/.stat-card pattern (see
// ProductsStatRow.tsx, DebtSummaryCards.tsx) rather than a bespoke
// strip, so this reads like every other stat row in the app instead
// of a one-off widget.
import { RegisterStockButton } from "@/modules/grain-register/components/RegisterStockButton";
import type { GrainRegisterStock } from "@/modules/grain-register/actions";
import type { RegisterCard } from "@/modules/grain-register/schema";

export function StockSummary({
  totalRemaining,
  unitName,
  ownAvailable,
  customerClaim,
  stockUdhaarOutstanding,
  stockValue,
  lentOut,
  atCustomerHomes = 0,
  customerAdvance = { LOAN: 0, HOME: 0 },
  borrowed,
  searchSlot,
  registerEdit,
}: {
  totalRemaining: number;
  unitName: string;
  ownAvailable: number;
  customerClaim: number;
  stockUdhaarOutstanding: number;
  // Value of the shop's own grain on hand, at the rates it was bought at.
  stockValue: number;
  // Grain loans still to come back to the shop / still to give back.
  lentOut: number;
  // Bought but still at the seller's home — also Advance stock.
  atCustomerHomes?: number;
  // Customers' Advance stock entries (customer pages), per section —
  // part of Advance stock.
  customerAdvance?: { LOAN: number; HOME: number };
  borrowed: number;
  // Shown in the grid's free cell under Stock Udhaar (the Grain page's
  // name search).
  searchSlot?: React.ReactNode;
  // Figures typed in from the register (display only), one per card;
  // a card with one shows it, with the system figure below.
  registerEdit?: { productId: string; productName: string; register: GrainRegisterStock };
}) {
  const register = registerEdit?.register ?? {};
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  // Advance stock's two sections: grain loans (lent out + customers'
  // Grain loan entries) and bought — at their home (at customers' homes
  // + customers' entries for it).
  const advanceLoans = round3(lentOut + customerAdvance.LOAN);
  const advanceHome = round3(atCustomerHomes + customerAdvance.HOME);
  const advance = round3(advanceLoans + advanceHome);

  function card(
    key: RegisterCard,
    label: string,
    // null = register only, no system figure behind it.
    system: number | null,
    tone: (value: number) => string,
    sub?: React.ReactNode,
    // Shown under the figures either way.
    breakdown?: React.ReactNode
  ) {
    const fromRegister = register[key];
    const value = fromRegister ?? system ?? 0;
    const money = key === "ownValue" || key === "stockUdhaarValue";
    const show = (n: number) => (money ? `Rs ${n.toLocaleString()}` : `${n} ${unitName}`);
    return (
      <div className="stat-card" style={registerEdit ? { position: "relative" } : undefined}>
        <p className="stat-label">{label}</p>
        <p className={`stat-value${tone(value)}`}>{show(value)}</p>
        {fromRegister !== undefined && system !== null ? (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
            <span className="pay-badge pay-mixed" style={{ marginRight: 6 }}>
              From register
            </span>
            System: {show(system)}
          </p>
        ) : fromRegister !== undefined ? (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
            <span className="pay-badge pay-mixed">From register</span>
          </p>
        ) : (
          sub
        )}
        {breakdown}
        {registerEdit && (
          <RegisterStockButton
            productId={registerEdit.productId}
            productName={registerEdit.productName}
            card={key}
            label={label}
            unit={money ? "Rs" : unitName}
            register={fromRegister}
            system={system}
          />
        )}
      </div>
    );
  }

  return (
    <div className="stat-grid" style={{ marginBottom: 22 }}>
      {card("ownKg", "Own stock", ownAvailable, () => " tone-primary")}
      {card("customerKg", "Customer stock", customerClaim, () => " tone-grain")}
      {card("physicalKg", "Total physical", totalRemaining, () => "")}
      {card("stockUdhaarKg", "Stock Udhaar", stockUdhaarOutstanding, (v) => (v ? " tone-consigned" : ""))}
      {/* What the Stock Udhaar is worth in money — owed to customers;
          register only, not linked to any record. */}
      {card("stockUdhaarValue", "Stock Udhaar value", null, (v) => (v ? " tone-consigned" : ""))}
      {card("ownValue", "Stock value", stockValue, () => "")}
      {/* The shop's own grain that isn't here: lent out on grain loans
          (coming back), or bought but still at the seller's home (to
          pick up) — counted in Own stock and Stock value, not in
          Total physical. */}
      {card(
        "advanceKg",
        "Advance stock",
        advance,
        (v) => (v ? " tone-grain" : ""),
        undefined,
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
          Grain loans {advanceLoans} · Bought — at their home {advanceHome}
        </p>
      )}
      {card("borrowedKg", "Borrowed (loans)", borrowed, (v) => (v ? " tone-consigned" : ""))}
      {searchSlot && <div className="grain-search-cell">{searchSlot}</div>}
    </div>
  );
}
