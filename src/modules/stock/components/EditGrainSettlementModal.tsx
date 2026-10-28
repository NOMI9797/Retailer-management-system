"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateGrainSettlement, getGrainSettlementDetails } from "../actions";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";

// Full edit of a grain purchase from a customer: the customer's whole
// deposit (when it was bought from an earlier deposit), how much of it
// the shop bought at an agreed rate, the rate, and how it was paid —
// with a live summary of what's still unpriced and the total amount.
// Loads the deposit details on open (getGrainSettlementDetails); the
// initial* props fill the form until they arrive. See
// updateGrainSettlement for how the edit is applied (fully reversed,
// then fully redone with the new numbers).
export function EditGrainSettlementModal({
  accountTransactionId,
  initialQuantity,
  initialRate,
  initialPaymentMethod,
  initialBankAccountId,
  unitName,
  bankAccounts = [],
  onClose,
}: {
  accountTransactionId: string;
  initialQuantity: number;
  initialRate: number;
  initialPaymentMethod: "CASH" | "ACCOUNT" | "CREDIT" | null;
  initialBankAccountId?: string | null;
  unitName: string;
  bankAccounts?: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [rate, setRate] = useState(String(initialRate));
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "ACCOUNT" | "CREDIT"
  >(initialPaymentMethod ?? "CASH");
  const [bankAccountId, setBankAccountId] = useState(
    initialBankAccountId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [details, setDetails] =
    useState<Awaited<ReturnType<typeof getGrainSettlementDetails>>>(null);
  const [deposit, setDeposit] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    getGrainSettlementDetails(accountTransactionId).then((d) => {
      setDetails(d);
      if (d) {
        setDeposit(String(d.depositQuantity));
        setQuantity(String(d.quantity));
        setRate(String(d.rate));
        if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
        setBankAccountId(d.bankAccountId ?? "");
        setReference(d.reference ?? "");
      }
    });
  }, [accountTransactionId]);

  // Bought at the customer's home: no deposit behind it to edit.
  const hasDeposit = !!details && details.kind !== "AT_HOME";
  const parsedQuantity = Number(quantity) || 0;
  const parsedRate = Number(rate) || 0;
  const total = parsedQuantity * parsedRate;
  const parsedDeposit = Number(deposit) || 0;
  const otherSettled = details?.otherSettled ?? 0;
  const stillUnpriced = parsedDeposit - otherSettled - parsedQuantity;
  const minDeposit = Math.max(
    details?.soldFromDeposit ?? 0,
    otherSettled + parsedQuantity,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    const result = await updateGrainSettlement({
      accountTransactionId,
      depositQuantity: hasDeposit ? parsedDeposit : undefined,
      quantity: parsedQuantity,
      rate: parsedRate,
      paymentMethod,
      bankAccountId: bankAccountId || undefined,
      reference,
    });
    if (!result.success) {
      setError(result.error);
      setIsSaving(false);
      return;
    }
    showToast("Settlement updated");
    setIsSaving(false);
    onClose();
    router.refresh();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit settlement</h2>

        <form onSubmit={handleSubmit}>
          {error && <p className="form-banner error">{error}</p>}

          {hasDeposit && (
            <div className="field">
              <label>Total deposited by customer ({unitName})</label>
              <input
                type="number"
                min={minDeposit}
                step="any"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                required
              />
              {otherSettled > 0 && (
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 12,
                    color: "var(--ink-muted)",
                  }}
                >
                  {otherSettled} {unitName} of it was bought in other
                  settlements.
                </p>
              )}
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label>Bought by shop — rate settled ({unitName})</label>
              <input
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Agreed rate (per {unitName})</label>
              <input
                type="number"
                min="0"
                step="any"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label>Pay via</label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as typeof paymentMethod)
              }
            >
              <option value="CASH">Cash</option>
              <option value="ACCOUNT">Account/bank</option>
              <option value="CREDIT">Udhaar — shop owes customer</option>
            </select>
          </div>

          {paymentMethod === "ACCOUNT" && (
            <BankAccountPicker
              bankAccounts={bankAccounts}
              value={bankAccountId}
              onChange={setBankAccountId}
            />
          )}

          <div className="settlement-summary">
            {hasDeposit && (
              <>
                <div>
                  <span>Deposited</span>
                  <strong>
                    {parsedDeposit} {unitName}
                  </strong>
                </div>
                <div>
                  <span>Bought</span>
                  <strong>
                    {parsedQuantity} {unitName}
                  </strong>
                </div>
                <div>
                  <span>Rate not settled</span>
                  <strong
                    style={{
                      color:
                        stillUnpriced < 0
                          ? "var(--consigned-600)"
                          : "var(--grain-600)",
                    }}
                  >
                    {stillUnpriced} {unitName}
                  </strong>
                </div>
              </>
            )}
            <div>
              <span>Total amount</span>
              <strong>Rs {total.toLocaleString()}</strong>
            </div>
          </div>

          <div className="field">
            <label>Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Slip no. / register page"
              required
            />
          </div>
          <div className="modal-actions" style={{ alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
