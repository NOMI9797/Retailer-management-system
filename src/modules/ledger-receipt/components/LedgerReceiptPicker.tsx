"use client";

import { useState } from "react";
import { CustomerPicker } from "@/modules/daily-sales/components/CustomerPicker";
import { LedgerReceiptPanel } from "./LedgerReceiptPanel";
import type { listAreas } from "@/modules/settings/areas.actions";

// The New entry screen's Ledger receipt: pick the customer (unless the
// screen already has one), then the dates.
export function LedgerReceiptPicker({
  areas,
  initialCustomer,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  initialCustomer?: { id: string; name: string };
}) {
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(
    initialCustomer ?? null,
  );
  return (
    <div>
      <CustomerPicker
        areas={areas}
        initial={initialCustomer}
        onChange={(s) =>
          setCustomer(
            s?.mode === "existing" ? { id: s.customerId, name: s.name } : null,
          )
        }
      />
      {customer ? (
        <LedgerReceiptPanel key={customer.id} customer={customer} />
      ) : (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>
          Pick an existing customer to see their ledger.
        </p>
      )}
    </div>
  );
}
