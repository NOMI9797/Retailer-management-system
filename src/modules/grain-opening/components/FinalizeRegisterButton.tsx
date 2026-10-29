"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizeGrainFromRegister, type FinalizePreview } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Grain page: makes this grain's register figures its records. Opens
// with a check of every card (nothing saved yet); Finalize saves it.
export function FinalizeRegisterButton({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FinalizePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function openModal() {
    setOpen(true);
    setPreview(null);
    setError(null);
    setIsBusy(true);
    const result = await finalizeGrainFromRegister({ productId, dryRun: true });
    setIsBusy(false);
    if (result.success) setPreview(result.data);
    else setError(result.error);
  }

  async function finalize() {
    setIsBusy(true);
    setError(null);
    const result = await finalizeGrainFromRegister({ productId });
    setIsBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(`${productName}: register figures are now the records`);
    setOpen(false);
    router.refresh();
  }

  const unit = preview?.unitName ?? "";
  const show = (n: number | null, money?: boolean) =>
    n === null ? "—" : money ? formatMoney(n) : `${n.toLocaleString()} ${unit}`;

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={openModal}>
        Finalize from register
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => !isBusy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Finalize {productName} from the register</h2>
            {isBusy && !preview && !error && <p className="modal-sub">Checking the figures…</p>}
            {error && <p className="form-banner error">{error}</p>}
            {preview && (
              <>
                <p className="modal-sub">
                  The register figures become this grain&apos;s records, and the cards show the records from now on.
                  Customer and dealer accounts don&apos;t change.
                </p>
                <div className="panel" style={{ marginBottom: 14 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Card</th>
                        <th style={{ textAlign: "right" }}>Register</th>
                        <th style={{ textAlign: "right" }}>Records now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.cards.map((c) => (
                        <tr key={c.label}>
                          <td>{c.label}</td>
                          <td className="num" style={{ textAlign: "right" }}>
                            {show(c.register, c.money)}
                          </td>
                          <td className="num" style={{ textAlign: "right", color: "var(--ink-muted)" }}>
                            {show(c.system, c.money)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bill-summary" style={{ marginBottom: 14 }}>
                  <div className="bill-summary-row">
                    <span>Grain no longer in the shop (sold, or at customers&apos; homes)</span>
                    <strong className="num">{show(preview.leftShopKg)}</strong>
                  </div>
                  <div className="bill-summary-row">
                    <span>Opening Stock Udhaar</span>
                    <strong className="num">
                      {show(preview.udhaarKg)} · {formatMoney(preview.udhaarValue)}
                    </strong>
                  </div>
                  <div className="bill-summary-row">
                    <span>Break-even rate</span>
                    <strong className="num">
                      {preview.udhaarKg > 0
                        ? `Rs ${preview.breakEven.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${unit}`
                        : "—"}
                    </strong>
                  </div>
                </div>
              </>
            )}
            <div className="modal-actions">
              {preview && (
                <button type="button" className="btn btn-primary" onClick={finalize} disabled={isBusy}>
                  {isBusy ? "Finalizing…" : "Finalize"}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={isBusy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
