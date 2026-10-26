"use client";

import { useState } from "react";
import { buildLedgerReceiptEscPos } from "@/modules/printing/escpos";
import { RECEIPT_HEADER } from "@/modules/printing/receiptHeader";
import { printRaw } from "@/modules/printing/qzClient";
import { showToast } from "@/components/shared/toastStore";
import type { LedgerReceipt } from "../actions";

// Sends a ledger receipt to the receipt printer (through QZ Tray).
export function PrintLedgerReceiptButton({
  receipt,
}: {
  receipt: LedgerReceipt;
}) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePrint() {
    setIsPrinting(true);
    setError(null);
    try {
      const printer = await printRaw(
        buildLedgerReceiptEscPos(receipt, RECEIPT_HEADER),
      );
      showToast(`Ledger receipt sent to ${printer}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Printing failed.");
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <>
      {error && (
        <span
          style={{
            fontSize: 12.5,
            color: "var(--consigned-600)",
            marginRight: 8,
          }}
        >
          {error}
        </span>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={handlePrint}
        disabled={isPrinting}
      >
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />
        </svg>
        {isPrinting ? "Printing…" : "Print receipt"}
      </button>
    </>
  );
}
