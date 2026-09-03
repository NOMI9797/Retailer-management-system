"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { listGrainProductDetails } from "../actions";
import { StockSummary } from "./StockSummary";
import { GrainBatchForm } from "./GrainBatchForm";
import { formatMoney } from "@/lib/utils";

type GrainProduct = {
  id: string;
  name: string;
  category: { name: string };
  unit: { name: string };
};

type Detail = Awaited<ReturnType<typeof listGrainProductDetails>>[string];

// One expandable card per grain product — pure display. Batches and
// the aggregate total arrive as a prop, fetched server-side in the
// Products page for every grain product in a single round trip.
// Adding a batch calls the Server Action then router.refresh() to
// re-run that server fetch — no client-side data fetching here.
export function GrainBatchList({ product, detail }: { product: GrainProduct; detail?: Detail }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [showAddBatch, setShowAddBatch] = useState(false);

  const batches = detail?.batches ?? [];
  const summary = detail?.summary ?? { batchCount: 0, totalIn: 0, totalSold: 0, totalRemaining: 0 };

  return (
    <div className={`grain-card${expanded ? " expanded" : ""}`}>
      <button className="grain-head" onClick={() => setExpanded((v) => !v)}>
        <div className="grain-head-left">
          <div className="grain-icon">
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M12 2v20M8 6l4-4 4 4M8 12l4-4 4 4M8 18l4-4 4 4" />
            </svg>
          </div>
          <div>
            <p className="grain-name">{product.name}</p>
            <p className="grain-sub">
              {summary.batchCount} batch{summary.batchCount === 1 ? "" : "es"} · {product.category.name}
            </p>
          </div>
        </div>
        <StockSummary totalRemaining={summary.totalRemaining} unitName={product.unit.name} />
      </button>

      {expanded && (
        <div className="batch-list">
          <div className="batch-row head">
            <span>Owner</span>
            <span>Qty in</span>
            <span>Sold</span>
            <span>Remaining</span>
            <span>Rate</span>
          </div>
          {batches.length === 0 ? (
            <p style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>No batches yet.</p>
          ) : (
            batches.map((batch) => {
              const remaining = Number(batch.quantityIn) - Number(batch.quantitySold);
              return (
                <div className="batch-row" key={batch.id}>
                  <span
                    className={`owner-tag ${batch.ownerCustomer ? "owner-customer" : "owner-shop"}`}
                  >
                    {batch.ownerCustomer ? batch.ownerCustomer.name : "Shop-owned"}
                  </span>
                  <span>
                    {Number(batch.quantityIn)} {product.unit.name}
                  </span>
                  <span>
                    {Number(batch.quantitySold)} {product.unit.name}
                  </span>
                  <span>
                    {remaining} {product.unit.name}
                  </span>
                  <span>{formatMoney(Number(batch.rate))}</span>
                </div>
              );
            })
          )}

          {showAddBatch ? (
            <GrainBatchForm
              productId={product.id}
              onSaved={() => {
                setShowAddBatch(false);
                router.refresh();
              }}
            />
          ) : (
            <div className="add-batch-row">
              <button className="btn btn-ghost" onClick={() => setShowAddBatch(true)}>
                Add batch
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
