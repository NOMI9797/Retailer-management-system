"use client";

import { useState } from "react";
import { PayDealerDebtForm } from "@/modules/dealers/components/PayDealerDebtModal";
import { formatMoney } from "@/lib/utils";
import type { getDealerBalances } from "@/modules/dealers/actions";

type DealerBalance = Awaited<ReturnType<typeof getDealerBalances>>[number];

// Pick which dealer to pay (only dealers the shop currently owes are
// listed), then the same PayDealerDebtForm the Dealers page uses.
export function PayDealerPanel({
  dealers,
  bankAccounts,
  onSaved,
  onCancel,
}: {
  dealers: DealerBalance[];
  bankAccounts: { id: string; name: string }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [dealerId, setDealerId] = useState("");
  const dealer = dealers.find((d) => d.id === dealerId);

  if (dealers.length === 0) {
    return <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>The shop doesn&apos;t owe any dealer right now.</p>;
  }

  return (
    <>
      <div className="field">
        <label>Dealer</label>
        <select value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
          <option value="" disabled>
            Select a dealer to pay
          </option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — owed {formatMoney(d.currentBalance)}
            </option>
          ))}
        </select>
      </div>

      {dealer && (
        <PayDealerDebtForm
          key={dealer.id}
          dealerId={dealer.id}
          dealerName={dealer.name}
          amountOwed={dealer.currentBalance}
          bankAccounts={bankAccounts}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      )}
    </>
  );
}
