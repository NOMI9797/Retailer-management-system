"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDealer } from "../actions";
import { showToast } from "@/components/shared/toastStore";

// Same trigger+modal shape as AddAccountTypeModal/AddProductModal —
// owns its own open/close state, calls router.refresh() on save.
export function AddDealerModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<"PRODUCTS" | "GRAIN">("PRODUCTS");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function reset() {
    setName("");
    setPhone("");
    setType("PRODUCTS");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await createDealer({ name, phone: phone || undefined, type });
      showToast(`Dealer added — ${name}`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add dealer");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg className="icon" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add dealer
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add dealer</h2>
            <p className="modal-sub">
              A bulk supplier/buyer — separate from your customers, with its own Udhaar balance.
            </p>
            <form onSubmit={handleSubmit}>
              {error && <p className="form-banner error">{error}</p>}

              <div className="field">
                <label>Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="field">
                <label>Phone (optional)</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div className="field">
                <label>Dealer type</label>
                <div className="stock-toggle">
                  <button
                    type="button"
                    className={type === "PRODUCTS" ? "active" : ""}
                    onClick={() => setType("PRODUCTS")}
                  >
                    Products
                  </button>
                  <button type="button" className={type === "GRAIN" ? "active" : ""} onClick={() => setType("GRAIN")}>
                    Grain
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Add dealer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
