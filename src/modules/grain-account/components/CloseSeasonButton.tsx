"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeGrainSeason } from "../actions";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney } from "@/lib/utils";

// Close season: asks once (with optional notes), then saves the season's
// result as final. Disabled — with the reasons listed beside it by the
// section — until the shop holds none of the grain.
export function CloseSeasonButton({
  productId,
  productName,
  seasonNumber,
  result,
  disabled,
}: {
  productId: string;
  productName: string;
  seasonNumber: number;
  result: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClose() {
    setIsSaving(true);
    setError(null);
    const response = await closeGrainSeason({ productId, notes });
    setIsSaving(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    showToast(`${productName} season ${seasonNumber} closed`);
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        style={disabled ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
        title={disabled ? "Not ready to close yet — see the list above" : undefined}
      >
        Close season {seasonNumber}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
      <p style={{ margin: 0, fontSize: 13.5 }}>
        Close {productName} season {seasonNumber} with a final{" "}
        <strong style={{ color: result >= 0 ? "var(--primary-600)" : "var(--consigned-600)" }}>
          {result >= 0 ? "profit" : "loss"} of {formatMoney(Math.abs(result))}
        </strong>
        ? A new season starts from zero.
      </p>
      <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <p className="form-banner error" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-primary" onClick={handleClose} disabled={isSaving}>
          {isSaving ? "Closing…" : "Yes, close season"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={isSaving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
