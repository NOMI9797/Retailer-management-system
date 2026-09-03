"use client";

import { useState } from "react";
import { useCustomers } from "@/modules/customers/hooks/useCustomers";
import { createGrainBatch } from "../actions";

type Owner = "SHOP" | "CUSTOMER";

// Add a batch to a grain product — owner toggle maps directly to
// ownerCustomerId being omitted (shop-owned) or set (consigned).
export function GrainBatchForm({
  productId,
  onSaved,
}: {
  productId: string;
  onSaved: () => void;
}) {
  const [owner, setOwner] = useState<Owner>("SHOP");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [quantityIn, setQuantityIn] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { customers } = useCustomers(customerSearch);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (owner === "CUSTOMER" && !customerId) {
      setError("Select the customer who owns this batch");
      return;
    }

    setIsSaving(true);
    try {
      await createGrainBatch({
        productId,
        ownerCustomerId: owner === "CUSTOMER" ? customerId : undefined,
        quantityIn: Number(quantityIn),
        rate: Number(rate),
      });
      setQuantityIn("");
      setRate("");
      setCustomerId("");
      setCustomerSearch("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add batch");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="add-batch-row">
      <div className="stock-toggle">
        <button type="button" className={owner === "SHOP" ? "active" : ""} onClick={() => setOwner("SHOP")}>
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

      {error && <p className="form-banner error">{error}</p>}

      {owner === "CUSTOMER" && (
        <div className="field">
          <label>Customer</label>
          <input
            type="text"
            placeholder="Search customer by name…"
            value={customerSearch}
            onChange={(e) => {
              setCustomerSearch(e.target.value);
              setCustomerId("");
            }}
          />
          {customerSearch && customers.length > 0 && !customerId && (
            <select
              size={Math.min(customers.length, 4)}
              onChange={(e) => {
                setCustomerId(e.target.value);
                const selected = customers.find((c) => c.id === e.target.value);
                if (selected) setCustomerSearch(selected.name);
              }}
              style={{ marginTop: 6 }}
            >
              <option value="" disabled>
                Select a customer
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label>Quantity received</label>
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
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Adding…" : "Add batch"}
        </button>
      </div>
    </form>
  );
}
