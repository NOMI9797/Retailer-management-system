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
  pooled,
  stockValue,
  lentOut,
  atCustomerHomes = 0,
  borrowed,
  searchSlot,
  registerEdit,
}: {
  totalRemaining: number;
  unitName: string;
  ownAvailable: number;
  customerClaim: number;
  stockUdhaarOutstanding: number;
  pooled: { quantity: number; isProfit: boolean; displayValue: number };
  // Value of the shop's own grain on hand, at the rates it was bought at.
  stockValue: number;
  // Grain loans still to come back to the shop / still to give back.
  lentOut: number;
  // Bought but still at the seller's home — also Advance stock.
  atCustomerHomes?: number;
  borrowed: number;
  // Shown in the grid's free cell under Stock Udhaar (the Grain page's
  // name search).
  searchSlot?: React.ReactNode;
  // Figures typed in from the register (display only), one per card;
  // a card with one shows it, with the system figure below.
  registerEdit?: { productId: string; productName: string; register: GrainRegisterStock };
}) {
  const register = registerEdit?.register ?? {};
  const advance = Math.round((lentOut + atCustomerHomes) * 1000) / 1000;

  function card(
    key: RegisterCard,
    label: string,
    system: number,
    tone: (value: number) => string,
    sub?: React.ReactNode
  ) {
    const fromRegister = register[key];
    const value = fromRegister ?? system;
    const money = key === "ownValue";
    const show = (n: number) => (money ? `Rs ${n.toLocaleString()}` : `${n} ${unitName}`);
    return (
      <div className="stat-card" style={registerEdit ? { position: "relative" } : undefined}>
        <p className="stat-label">{label}</p>
        <p className={`stat-value${tone(value)}`}>{show(value)}</p>
        {fromRegister !== undefined ? (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
            <span className="pay-badge pay-mixed" style={{ marginRight: 6 }}>
              From register
            </span>
            System: {show(system)}
          </p>
        ) : (
          sub
        )}
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
      {card("pooledKg", "Pooled stock", pooled.quantity, () => " tone-grain")}
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
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
          {atCustomerHomes > 0 ? `Lent ${lentOut} · At customers' homes ${atCustomerHomes}` : "Shop's grain lent out"}
        </p>
      )}
      {card("borrowedKg", "Borrowed (loans)", borrowed, (v) => (v ? " tone-consigned" : ""))}
      {searchSlot && <div className="grain-search-cell">{searchSlot}</div>}
    </div>
  );
}
