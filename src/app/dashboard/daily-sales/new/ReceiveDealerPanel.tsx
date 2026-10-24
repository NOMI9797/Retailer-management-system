"use client";

import { useState } from "react";
import { ReceiveDealerPaymentForm } from "@/modules/dealers/components/DealerUdhaarModal";
import { formatMoney } from "@/lib/utils";
import type { listDealerUdhaarSides } from "@/modules/dealers/actions";

type DealerBalance = Awaited<ReturnType<typeof listDealerUdhaarSides>>[number];

// Pick which dealer is paying the shop (only dealers who currently owe
// the shop are listed), then the same form the dealer page's Udhaar
// clearance uses — the mirror of PayDealerPanel.
export function ReceiveDealerPanel({
  dealers,
  bankAccounts,
  onSaved,
  onCancel,
  initialDealerId,
}: {
  dealers: DealerBalance[];
  bankAccounts: { id: string; name: string }[];
  onSaved: () => void;
  onCancel: () => void;
  initialDealerId?: string;
}) {
  const [dealerId, setDealerId] = useState(dealers.some((d) => d.id === initialDealerId) ? initialDealerId! : "");
  const dealer = dealers.find((d) => d.id === dealerId);

  if (dealers.length === 0) {
    return <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>No dealer owes the shop anything right now.</p>;
  }

  return (
    <>
      <div className="field">
        <label>Dealer</label>
        <select value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
          <option value="" disabled>
            Select the dealer who is paying
          </option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — owes {formatMoney(d.dealerOwes)}
            </option>
          ))}
        </select>
      </div>

      {dealer && (
        <ReceiveDealerPaymentForm
          key={dealer.id}
          dealerId={dealer.id}
          amountOwed={dealer.dealerOwes}
          bankAccounts={bankAccounts}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      )}
    </>
  );
}
