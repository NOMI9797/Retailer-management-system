"use client";

import { useEffect, useState } from "react";
import { getCustomerGrainDeposits, getShopOwedForGrainByProduct } from "@/modules/stock/actions";
import { createCustomer } from "@/modules/customers/actions";
import { CustomerGrainSection } from "@/modules/stock/components/CustomerGrainSection";
import { GrainBatchForm } from "@/modules/products/components/GrainBatchForm";
import { CustomerPicker, type CustomerSelection } from "./CustomerPicker";
import { showToast } from "@/components/shared/toastStore";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listProducts } from "@/modules/products/actions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];
type GrainProduct = Awaited<ReturnType<typeof listProducts>>["products"][number];
type Deposits = Awaited<ReturnType<typeof getCustomerGrainDeposits>>;
type SelectedCustomer = { id: string; name: string; phone?: string };

// Picks a customer via the SAME CustomerPicker New Sale uses — search
// existing, or type a name that doesn't match and add them as a new
// customer right there (a customer submitting stock for the first
// time is exactly as common a case here as a first-time buyer is on
// New Sale, so this needed the identical "search or create" flow, not
// the existing-only search UdhaarClearanceForm's pattern was borrowed
// from originally — no account-type filter here either, matching
// CustomerPicker's own simpler shape). Unlike New Sale, a "new"
// selection is resolved into a real customer (createCustomer)
// IMMEDIATELY on pick, not deferred to a later submit — this whole
// screen is about a customer record (their deposits, their
// new-deposit form), not a single transaction, so there's no natural
// "submit" moment to defer to; every other part of the screen needs a
// real customerId to work at all.
export function StockFromCustomerForm({
  areas,
  grainProducts,
}: {
  areas: Area[];
  grainProducts: GrainProduct[];
}) {
  const [selected, setSelected] = useState<SelectedCustomer | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickerChange(selection: CustomerSelection | null) {
    setError(null);
    if (!selection) return;

    if (selection.mode === "existing") {
      setSelected({ id: selection.customerId, name: selection.name });
      return;
    }

    // New customer — create right away so the rest of this screen
    // (deposits table, deposit form) has a real id to work with.
    setIsResolving(true);
    try {
      const created = await createCustomer({
        name: selection.name,
        phone: selection.phone,
        areaId: selection.areaId,
        accountTypeIds: selection.accountTypeIds,
      });
      showToast(`Customer added — ${created.name}`);
      setSelected({ id: created.id, name: created.name, phone: created.phone ?? undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add customer");
    } finally {
      setIsResolving(false);
    }
  }

  function clearSelection() {
    setSelected(null);
    setError(null);
  }

  if (selected) {
    return (
      <div>
        <button type="button" className="btn btn-ghost" onClick={clearSelection} style={{ marginBottom: 16 }}>
          <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Search a different customer
        </button>

        <div className="cust-header" style={{ marginBottom: 20 }}>
          <div className="cust-avatar-lg">{selected.name.charAt(0).toUpperCase()}</div>
          <div>
            <h1 style={{ fontSize: 20 }}>{selected.name}</h1>
            <p>{selected.phone || "No phone"}</p>
          </div>
        </div>

        <CustomerGrainPanel customerId={selected.id} customerName={selected.name} grainProducts={grainProducts} />
      </div>
    );
  }

  return (
    <div>
      {error && <p className="form-banner error">{error}</p>}
      <CustomerPicker areas={areas} onChange={handlePickerChange} />
      {isResolving && <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>Adding customer…</p>}
    </div>
  );
}

// The selected customer's grain: existing deposits (with a
// per-batch "Buy from customer" for anything unsettled) and a form
// to record a new deposit. Its own component so it can hold the
// fetched deposits in local state and refetch after a write, the
// same "local state refresh" reasoning UdhaarClearanceForm's
// RecordPaymentButton uses — router.refresh() alone re-runs Server
// Components, not this client component's already-fetched data.
function CustomerGrainPanel({
  customerId,
  customerName,
  grainProducts,
}: {
  customerId: string;
  customerName: string;
  grainProducts: GrainProduct[];
}) {
  const [deposits, setDeposits] = useState<Deposits | null>(null);
  const [moneyOwedByProduct, setMoneyOwedByProduct] = useState<Map<string, { owed: number; paid: number }>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [productId, setProductId] = useState(grainProducts[0]?.id ?? "");
  // Selection-based instead of both sections stacked — a shopkeeper
  // picks EITHER "look up what's already here" OR "record something
  // new" at a time, same "one thing on screen at once" pattern the
  // New Sale form's own Product/Grain sale-type toggle uses.
  const [view, setView] = useState<"deposits" | "new">("deposits");

  async function loadDeposits() {
    setIsLoading(true);
    try {
      const [result, owedByProduct] = await Promise.all([
        getCustomerGrainDeposits(customerId),
        getShopOwedForGrainByProduct(customerId),
      ]);
      setDeposits(result);
      setMoneyOwedByProduct(owedByProduct);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDeposits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <>
      <div className="stock-toggle" style={{ marginBottom: 16 }}>
        <button type="button" className={view === "deposits" ? "active" : ""} onClick={() => setView("deposits")}>
          Existing deposits
        </button>
        <button type="button" className={view === "new" ? "active" : ""} onClick={() => setView("new")}>
          Record a new deposit
        </button>
      </div>

      {view === "deposits" ? (
        isLoading ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>Loading…</p>
        ) : (
          <CustomerGrainSection
            deposits={deposits ?? { batches: [], stockUdhaar: [] }}
            moneyOwedByProduct={moneyOwedByProduct}
            customerId={customerId}
            customerName={customerName}
            onSettle={loadDeposits}
          />
        )
      ) : grainProducts.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 13.5 }}>
          No grain products yet — add one from the Grain page first.
        </p>
      ) : (
        <div className="panel" style={{ padding: 20 }}>
          <div className="field" style={{ maxWidth: 320 }}>
            <label>Product</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {grainProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <GrainBatchForm
            key={productId}
            productId={productId}
            forCustomerId={customerId}
            onSaved={() => {
              loadDeposits();
              setView("deposits");
            }}
          />
        </div>
      )}
    </>
  );
}
