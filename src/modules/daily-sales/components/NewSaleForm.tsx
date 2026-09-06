"use client";

import { useMemo, useState } from "react";
import { CustomerPicker, type CustomerSelection } from "./CustomerPicker";
import { LineItemsEditor, type LineItemDraft } from "./LineItemsEditor";
import { PaymentSplitEditor, type PaymentSplitDraft } from "./PaymentSplitEditor";
import { createCustomer } from "@/modules/customers/actions";
import { createDailySale } from "../actions";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import type { listProducts } from "@/modules/products/actions";

type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

export function NewSaleForm({
  areas,
  accountTypes,
  products,
  onSaved,
}: {
  areas: Awaited<ReturnType<typeof listAreas>>;
  accountTypes: Awaited<ReturnType<typeof listAccountTypes>>;
  products: Product[];
  onSaved?: () => void;
}) {
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const [items, setItems] = useState<LineItemDraft[]>([{ productId: "", quantity: "", actualPrice: "" }]);
  const [payments, setPayments] = useState<PaymentSplitDraft>({ cash: "", account: "", credit: "" });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const itemTotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.actualPrice) || 0), 0),
    [items]
  );

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

    setIsSaving(true);
    try {
      let customerId: string;
      let accountTypeId: string | undefined;
      if (customer.mode === "existing") {
        customerId = customer.customerId;
        accountTypeId = customer.accountTypeId;
      } else {
        const created = await createCustomer({
          name: customer.name,
          phone: customer.phone,
          areaId: customer.areaId,
          accountTypeIds: customer.accountTypeIds,
        });
        customerId = created.id;
      }

      await createDailySale({
        customerId,
        accountTypeId,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          actualPrice: Number(i.actualPrice),
        })),
        payments: { cash, account, credit },
      });

      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record sale");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-banner error">{error}</p>}

      <CustomerPicker areas={areas} accountTypes={accountTypes} onChange={setCustomer} />

      <LineItemsEditor products={products} items={items} onChange={setItems} />

      <PaymentSplitEditor total={itemTotal} payments={payments} onChange={setPayments} />

      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Record sale"}
        </button>
      </div>
    </form>
  );
}
