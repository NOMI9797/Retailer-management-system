import { formatMoney } from "@/lib/utils";
import type { getDealerUdhaarTotals } from "@/modules/dealers/actions";

// The Dealer page's Products / Grain tab cards: Udhaar both ways (what
// the shop owes these dealers, what they owe the shop, and the net —
// labelled with who owes), then the total spent on purchases.
export function DealerSummaryCards({
  udhaar,
  totalSpent,
}: {
  udhaar: Awaited<ReturnType<typeof getDealerUdhaarTotals>>;
  totalSpent: number;
}) {
  const netLabel =
    udhaar.netOwedBy === "SHOP"
      ? "Net — shop owes dealers"
      : udhaar.netOwedBy === "DEALERS"
        ? "Net — dealers owe shop"
        : "Net — settled";
  const netTone =
    udhaar.netOwedBy === "SHOP"
      ? "tone-consigned"
      : udhaar.netOwedBy === "DEALERS"
        ? "tone-primary"
        : "";

  return (
    <div className="stat-grid" style={{ marginBottom: 22 }}>
      <div className="stat-card">
        <p className="stat-label">{netLabel}</p>
        <p className={`stat-value ${netTone}`}>
          {formatMoney(udhaar.netAmount)}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Shop owes dealers</p>
        <p className={`stat-value${udhaar.shopOwes ? " tone-consigned" : ""}`}>
          {formatMoney(udhaar.shopOwes)}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Dealers owe shop</p>
        <p className={`stat-value${udhaar.dealersOwe ? " tone-primary" : ""}`}>
          {formatMoney(udhaar.dealersOwe)}
        </p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Total spent</p>
        <p className="stat-value">{formatMoney(totalSpent)}</p>
      </div>
    </div>
  );
}
