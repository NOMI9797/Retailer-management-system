"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerPicker, type CustomerSelection } from "./CustomerPicker";
import { LineItemsEditor, type LineItemDraft } from "./LineItemsEditor";
import { GrainItemsEditor, type GrainItemDraft } from "./GrainItemsEditor";
import { PaymentSplitEditor, type PaymentSplitDraft } from "./PaymentSplitEditor";
import { createCustomer } from "@/modules/customers/actions";
import { createDailySale } from "../actions";
import { toLocalDateString, formatMoney } from "@/lib/utils";
import { showToast } from "@/components/shared/toastStore";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listProducts } from "@/modules/products/actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];
type SaleKind = "PRODUCT" | "GRAIN";

function todayDateString() {
  return toLocalDateString(new Date());
}

export function NewSaleForm({
  areas,
  products,
  bankAccounts = [],
  onSaved,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  products: Product[];
  bankAccounts?: { id: string; name: string }[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [saleDate, setSaleDate] = useState(todayDateString());
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  // A sale is either all-Product or all-Grain, never mixed — per the
  // "shopkeeper adds one entry, either a product or a grain" decision.
  // Kept as two separate item lists rather than one shared shape,
  // since GrainItemDraft carries fields (creditAmount, creditDueDate)
  // that only ever make sense for grain; switching kind clears
  // whichever list isn't active, so a stray half-filled row from the
  // other mode never gets silently submitted.
  const [saleKind, setSaleKind] = useState<SaleKind>("PRODUCT");
  const [productItems, setProductItems] = useState<LineItemDraft[]>([
    { productId: "", quantity: "", actualPrice: "" },
  ]);
  const [grainItems, setGrainItems] = useState<GrainItemDraft[]>([{ productId: "", quantity: "", actualPrice: "" }]);
  const items = saleKind === "PRODUCT" ? productItems : grainItems;
  const [payments, setPayments] = useState<PaymentSplitDraft>({ cash: "", account: "", credit: "" });

  const simpleProducts = useMemo(() => products.filter((p) => p.stockKind === "SIMPLE"), [products]);
  const grainProducts = useMemo(() => products.filter((p) => p.stockKind === "GRAIN"), [products]);

  function switchSaleKind(kind: SaleKind) {
    setSaleKind(kind);
    // Reset to one empty row for whichever kind wasn't active — a
    // shopkeeper switching mid-entry expects a clean slate for the
    // new kind, not their old picks silently carried over as a
    // different product type.
    if (kind === "PRODUCT") setProductItems([{ productId: "", quantity: "", actualPrice: "" }]);
    else setGrainItems([{ productId: "", quantity: "", actualPrice: "" }]);
  }
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const itemTotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.actualPrice) || 0), 0),
    [items]
  );

  // Once a "new" customer pick has actually been created, this holds
  // their real id so a second submitSale() call never creates them
  // twice. A real ref (not component state) since it must survive
  // across the async gap between submits without triggering a
  // re-render of its own, and resets whenever the shopkeeper picks a
  // different customer (see the CustomerPicker onChange wiring below).
  const resolvedCustomerIdRef = useRef<string | null>(null);

  async function submitSale() {
    let customerId = resolvedCustomerIdRef.current;
    if (!customerId) {
      if (customer!.mode === "existing") {
        customerId = customer!.customerId;
      } else {
        const created = await createCustomer({
          name: customer!.name,
          phone: customer!.phone,
          areaId: customer!.areaId,
          accountTypeIds: customer!.accountTypeIds,
        });
        customerId = created.id;
      }
      resolvedCustomerIdRef.current = customerId;
    }

    const cash = Number(payments.cash) || 0;
    const account = Number(payments.account) || 0;
    const credit = Number(payments.credit) || 0;

    await createDailySale({
      customerId,
      saleDate,
      items:
        saleKind === "PRODUCT"
          ? productItems.map((i) => ({
              productId: i.productId,
              quantity: Number(i.quantity),
              actualPrice: Number(i.actualPrice),
            }))
          : grainItems.map((i) => ({
              productId: i.productId,
              quantity: Number(i.quantity),
              actualPrice: Number(i.actualPrice),
              creditAmount: i.creditAmount ? Number(i.creditAmount) : undefined,
              creditDueDate: i.creditDueDate,
            })),
      payments: { cash, account, credit, bankAccountId: payments.bankAccountId },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customer) {
      setError("Select or add a customer first");
      return;
    }
    if (items.some((i) => !i.productId || !i.quantity || !i.actualPrice)) {
      setError("Every item needs a product, quantity, and price");
      return;
    }

    const cash = Number(payments.cash) || 0;
    const account = Number(payments.account) || 0;
    const credit = Number(payments.credit) || 0;
    if (Math.abs(cash + account + credit - itemTotal) > 0.01) {
      setError("Cash + Account + Credit must add up to the bill total");
      return;
    }

    // More than one grain item plus a Credit amount needs an explicit
    // per-item split (see GrainItemsEditor's own "showPerItemCredit"
    // banner) — a single grain item needs none, its whole credit
    // amount is unambiguous.
    if (saleKind === "GRAIN" && grainItems.length > 1 && credit > 0) {
      if (grainItems.some((i) => !i.creditAmount)) {
        setError("Specify how much Udhaar applies to each grain item");
        return;
      }
      const allocated = grainItems.reduce((sum, i) => sum + Number(i.creditAmount), 0);
      if (Math.abs(allocated - credit) > 0.01) {
        setError("The grain items' Udhaar amounts must add up to the sale's total Udhaar");
        return;
      }
    }

    setIsSaving(true);
    try {
      await submitSale();
      showToast(`Sale recorded — ${formatMoney(itemTotal)}`);

      if (onSaved) {
        onSaved();
      } else {
        router.push("/dashboard/daily-sales");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record sale");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <div className="field" style={{ maxWidth: 220 }}>
        <label>Sale date</label>
        <input
          type="date"
          value={saleDate}
          max={todayDateString()}
          onChange={(e) => setSaleDate(e.target.value)}
          required
        />
      </div>

      <CustomerPicker
        areas={areas}
        onChange={(next) => {
          // Changing the customer mid-flow invalidates any resolved id
          // from a prior attempt.
          resolvedCustomerIdRef.current = null;
          setCustomer(next);
        }}
      />

      <div className="field">
        <label>Sale type</label>
        <div className="stock-toggle">
          <button type="button" className={saleKind === "PRODUCT" ? "active" : ""} onClick={() => switchSaleKind("PRODUCT")}>
            Product sale
          </button>
          <button type="button" className={saleKind === "GRAIN" ? "active" : ""} onClick={() => switchSaleKind("GRAIN")}>
            Grain sale
          </button>
        </div>
      </div>

      {saleKind === "PRODUCT" ? (
        <LineItemsEditor products={simpleProducts} items={productItems} onChange={setProductItems} />
      ) : (
        <GrainItemsEditor
          products={grainProducts}
          items={grainItems}
          onChange={setGrainItems}
          saleCreditAmount={Number(payments.credit) || 0}
        />
      )}

      <PaymentSplitEditor total={itemTotal} payments={payments} bankAccounts={bankAccounts} onChange={setPayments} />

      <div className="modal-actions">
        {!onSaved && (
          <button type="button" className="btn btn-ghost" onClick={() => router.push("/dashboard/daily-sales")}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Record sale"}
        </button>
      </div>
    </form>
  );
}
