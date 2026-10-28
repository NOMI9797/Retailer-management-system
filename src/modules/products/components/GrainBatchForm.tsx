"use client";

import { useState } from "react";
import { createGrainBatch } from "../actions";
import { createDepositWithSettlement } from "@/modules/stock/actions";
import { createHomeGrainImport } from "@/modules/stock/homeGrain.actions";
import { HOME_GRAIN_RATES_ENABLED } from "@/modules/stock/homeGrainSettings";
import { createCustomer } from "@/modules/customers/actions";
import {
  CustomerPicker,
  type CustomerSelection,
} from "@/modules/daily-sales/components/CustomerPicker";
import { BankAccountPicker } from "@/components/shared/BankAccountPicker";
import { showToast } from "@/components/shared/toastStore";
import type { listAreas } from "@/modules/settings/areas.actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];

type Owner = "SHOP" | "CUSTOMER";
// Only meaningful when owner is CUSTOMER. LATER = today's plain
// deposit (no price yet — see GrainBatch.rate's schema comment). NOW
// = the customer wants to sell right at drop-off, a shortcut for what
// would otherwise be a deposit followed by a separate "Buy from
// customer" action later (see GrainBatchList.tsx's TransferPurchaseForm,
// which still exists for exactly that later-settlement case). HOME =
// the shop buys it now but the grain stays at the customer's home
// until the shop picks it up (in trips).
type Settlement = "LATER" | "NOW" | "HOME";

// Add a batch to a grain product — owner toggle maps directly to
// ownerCustomerId being omitted (shop-owned) or set (a customer
// deposit). A shop-owned batch always needs a real rate — it's the
// shop's own inventory. A customer batch's rate depends on the
// settlement choice below.
//
// forCustomerId (set by StockFromCustomerForm, which already knows
// the customer from its own search step) locks the owner to CUSTOMER
// and skips the customer-search field entirely — no reason to search
// for someone the caller has already identified. The Grain page's
// AddBatchModal never passes this, so its "Shop-owned vs Customer"
// toggle and search field behave exactly as before.
export function GrainBatchForm({
  productId,
  forCustomerId,
  areas,
  bankAccounts = [],
  onSaved,
}: {
  productId: string;
  forCustomerId?: string;
  // Only needed when forCustomerId is omitted — the caller already
  // knowing the customer (StockFromCustomerForm) skips CustomerPicker
  // entirely, same as before.
  areas?: Area[];
  bankAccounts?: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [owner, setOwner] = useState<Owner>(
    forCustomerId ? "CUSTOMER" : "SHOP",
  );
  const [settlement, setSettlement] = useState<Settlement>("LATER");
  // Search-or-create, same widget New Sale/Stock-from-customer already
  // use — replaces the old bespoke text-input + native listbox, which
  // was both visually inconsistent with the rest of the app and had
  // no way to add someone not already a customer.
  const [customerSelection, setCustomerSelection] =
    useState<CustomerSelection | null>(null);
  const [quantityIn, setQuantityIn] = useState("");
  const [rate, setRate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "ACCOUNT" | "CREDIT"
  >("CASH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const atHome = owner === "CUSTOMER" && settlement === "HOME";
  // At their home with rates switched off: a quantity only — no rate,
  // no payment, Rs 0 of value (see HOME_GRAIN_RATES_ENABLED).
  const quantityOnly = atHome && !HOME_GRAIN_RATES_ENABLED;
  // Bought now (at a rate, paid) — whether it's here or still at their home.
  const sellingNow = owner === "CUSTOMER" && (settlement === "NOW" || (atHome && !quantityOnly));

  function resetForm() {
    setQuantityIn("");
    setRate("");
    setCustomerSelection(null);
    setSettlement("LATER");
    setReference("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (owner === "CUSTOMER" && !forCustomerId && !customerSelection) {
      setError("Select the customer who owns this batch");
      return;
    }

    setIsSaving(true);
    try {
      // A "new" pick has no customerId yet — resolve it into a real
      // customer first (same immediate-resolve pattern NewSaleForm/
      // ShopBorrowedLoanModal use), since both write paths below need
      // one either way.
      let effectiveCustomerId = forCustomerId;
      if (!effectiveCustomerId && customerSelection) {
        effectiveCustomerId =
          customerSelection.mode === "existing"
            ? customerSelection.customerId
            : (
                await createCustomer({
                  name: customerSelection.name,
                  phone: customerSelection.phone,
                  areaId: customerSelection.areaId,
                  accountTypeIds: customerSelection.accountTypeIds,
                })
              ).id;
      }

      if (quantityOnly) {
        const result = await createHomeGrainImport({
          productId,
          customerId: effectiveCustomerId!,
          quantity: Number(quantityIn),
          reference,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        showToast("Recorded — the shop's grain at the customer's home. Pick it up from the records.");
      } else if (sellingNow) {
        const result = await createDepositWithSettlement({
          productId,
          customerId: effectiveCustomerId!,
          quantity: Number(quantityIn),
          rate: Number(rate),
          paymentMethod,
          bankAccountId: bankAccountId || undefined,
          reference,
          atHome,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        showToast(
          atHome
            ? "Bought — still at the customer's home. Pick it up from the records."
            : "Purchased from customer — added to shop stock"
        );
      } else {
        const result = await createGrainBatch({
          productId,
          ownerCustomerId:
            owner === "CUSTOMER" ? effectiveCustomerId : undefined,
          quantityIn: Number(quantityIn),
          // Store-for-later means genuinely no rate — nothing is
          // priced at deposit time (Stock Management spec, section 2).
          rate: owner === "CUSTOMER" ? undefined : Number(rate),
          reference,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        showToast("Batch added");
      }
      resetForm();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="add-batch-row">
      {!forCustomerId && (
        <div className="stock-toggle">
          <button
            type="button"
            className={owner === "SHOP" ? "active" : ""}
            onClick={() => setOwner("SHOP")}
          >
            Shop-owned
          </button>
          <button
            type="button"
            className={owner === "CUSTOMER" ? "active" : ""}
            onClick={() => setOwner("CUSTOMER")}
          >
            Customer
          </button>
        </div>
      )}

      {error && <p className="form-banner error">{error}</p>}

      {owner === "CUSTOMER" && (
        <>
          {!forCustomerId && areas && (
            <CustomerPicker areas={areas} onChange={setCustomerSelection} />
          )}

          <div className="stock-toggle" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className={settlement === "LATER" ? "active" : ""}
              onClick={() => setSettlement("LATER")}
            >
              Store for later
            </button>
            <button
              type="button"
              className={settlement === "NOW" ? "active" : ""}
              onClick={() => setSettlement("NOW")}
            >
              Selling now
            </button>
            <button
              type="button"
              className={settlement === "HOME" ? "active" : ""}
              onClick={() => setSettlement("HOME")}
            >
              Bought — still at their home
            </button>
          </div>
          {atHome && (
            <p style={{ margin: "-6px 0 14px", fontSize: 12.5, color: "var(--ink-muted)" }}>
              {quantityOnly
                ? "The shop's grain lying at their home. Its rate and value were already settled in the past, so only the quantity is recorded here — no payment now, nothing added to Stock value. It counts in Own stock and Advance stock, and joins physical stock as it's picked up, in one trip or several."
                : "The shop pays now and owns this grain (Own stock, Stock value, Advance stock), but it isn't here yet — it joins physical stock as it's picked up from their home, in one trip or several."}
            </p>
          )}
        </>
      )}

      <div className="field-row">
        <div className="field">
          <label>{quantityOnly ? "Quantity at their home" : atHome ? "Quantity bought" : "Quantity received"}</label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={quantityIn}
            onChange={(e) => setQuantityIn(e.target.value)}
            required
          />
        </div>
        {/* No rate field at all for a plain "store for later" deposit
            — nothing is priced at drop-off time (spec section 2). A
            shop-owned batch, or a customer selling right now, always
            needs a real rate. */}
        {(owner === "SHOP" || sellingNow) && (
          <div className="field">
            <label>Rate</label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Rs 0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </div>
        )}
      </div>

      {sellingNow && (
        <>
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
        </>
      )}

      {/* Every way grain comes in carries a slip / register reference. */}
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
      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving
            ? "Saving…"
            : quantityOnly
              ? "Record grain at their home"
              : atHome
                ? "Record purchase (at their home)"
                : sellingNow
                  ? "Record purchase"
                  : "Add batch"}
        </button>
      </div>
    </form>
  );
}
