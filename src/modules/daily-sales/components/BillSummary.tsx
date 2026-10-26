"use client";

import { formatMoney } from "@/lib/utils";

// The bill, clearly: what the items come to, an optional discount the
// shopkeeper types in (Rs), and — large — what the customer pays. The
// payment split below it is filled against that last figure.
export function BillSummary({
  itemTotal,
  discount,
  onDiscountChange,
}: {
  itemTotal: number;
  discount: string;
  onDiscountChange: (value: string) => void;
}) {
  const discountAmount = Number(discount) || 0;
  const toPay = itemTotal - discountAmount;
  const tooMuch = discountAmount > itemTotal + 0.005;

  return (
    <div className="bill-summary">
      <div className="bill-summary-row">
        <span>Bill total</span>
        <strong className="num">{formatMoney(itemTotal)}</strong>
      </div>
      <div className="bill-summary-row">
        <label htmlFor="bill-discount">
          Discount <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>(optional, Rs)</span>
        </label>
        <input
          id="bill-discount"
          type="number"
          min="0"
          step="any"
          placeholder="0"
          value={discount}
          onChange={(e) => onDiscountChange(e.target.value)}
          className="num"
        />
      </div>
      {tooMuch && <p className="bill-summary-error">The discount can&apos;t be more than the bill total.</p>}
      <div className="bill-summary-row bill-summary-total">
        <span>{discountAmount > 0 ? "To pay after discount" : "To pay"}</span>
        <strong className="num">{formatMoney(Math.max(toPay, 0))}</strong>
      </div>
    </div>
  );
}
