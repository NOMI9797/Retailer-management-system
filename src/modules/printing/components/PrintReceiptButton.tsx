"use client";

import { useState } from "react";
import { getReceiptDetail } from "@/modules/daily-sales/actions";
import { showToast } from "@/components/shared/toastStore";
import { buildReceiptEscPos, type PrintableReceipt } from "../escpos";
import { RECEIPT_HEADER } from "../receiptHeader";
import { printRaw } from "../qzClient";

// Either the full receipt is already in hand (detail page), or just its
// identity is (the Receipts list rows only carry a brief summary), in
// which case the full detail is fetched at click time.
type Props = { variant?: "icon" | "button" } & (
  | { receipt: PrintableReceipt; dailySaleId?: never; visitAt?: never }
  | { receipt?: never; dailySaleId: string; visitAt: Date }
);

export function PrintReceiptButton(props: Props) {
  const { variant = "icon" } = props;
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePrint() {
    setIsPrinting(true);
    setError(null);
    try {
      const receipt = props.receipt ?? (await getReceiptDetail(props.dailySaleId, props.visitAt));
      if (!receipt) throw new Error("This receipt could not be found.");

      const printer = await printRaw(buildReceiptEscPos(receipt, RECEIPT_HEADER));
      showToast(`Receipt #${receipt.receiptNumber} sent to ${printer}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Printing failed.");
    } finally {
      setIsPrinting(false);
    }
  }

  const icon = (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />
    </svg>
  );

  return (
    <>
      {error && <span style={{ fontSize: 12.5, color: "var(--consigned-600)", marginRight: 8 }}>{error}</span>}
      {variant === "icon" ? (
        <button className="icon-btn" onClick={handlePrint} disabled={isPrinting} title="Print receipt">
          {icon}
        </button>
      ) : (
        <button className="btn btn-primary" onClick={handlePrint} disabled={isPrinting}>
          {icon}
          {isPrinting ? "Printing…" : "Print receipt"}
        </button>
      )}
    </>
  );
}
