"use client";

import { useState } from "react";
import { LedgerReceiptPanel } from "./LedgerReceiptPanel";

// "Ledger receipt" button on the customer page — opens the date picker
// and receipt in a dialog.
export function LedgerReceiptModal({
  customer,
}: {
  customer: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />
        </svg>
        Ledger receipt
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 860, maxWidth: "95vw" }}
          >
            <h2>Ledger receipt</h2>
            <p className="modal-sub">
              Everything between <strong>{customer.name}</strong> and the shop
              in the dates you pick.
            </p>
            <LedgerReceiptPanel customer={customer} />
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
