"use client";

import { useState } from "react";
import { GrainLoanModal, type LoanParty } from "./GrainLoanModal";
import { GrainLoanRecords } from "./GrainLoanRecords";
import { GrainLoanReturnModal } from "./GrainLoanReturnModal";
import type { GrainLoanRow } from "../actions";
import type { AdvanceRegisterRow } from "@/modules/grain-register/actions";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// One customer's or dealer's grain loans — the Grain loans tab on a
// customer's or dealer's page. Same layout as the customer's Grain tab
// (CustomerGrainSection): one sub-tab per grain, that grain's cards,
// then its records. The grain sub-tab is local UI state only; the
// loans come from the page's server fetch.
export function GrainLoansPanel({
  party,
  loans,
  products,
  bankAccounts,
  registerRows = [],
}: {
  party: LoanParty;
  loans: GrainLoanRow[];
  products: { id: string; name: string }[];
  bankAccounts: { id: string; name: string }[];
  // Grain lent to this customer per the register — rows in the table
  // and counted in this tab's cards.
  registerRows?: AdvanceRegisterRow[];
}) {
  // Grains with loans, most recent loan first (loans arrive newest first).
  const grains: { id: string; name: string }[] = [];
  for (const l of [
    ...loans,
    ...registerRows.map((e) => ({ productId: e.productId, productName: e.productName })),
  ]) {
    if (!grains.some((g) => g.id === l.productId))
      grains.push({ id: l.productId, name: l.productName });
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const selectedId =
    activeId && grains.some((g) => g.id === activeId)
      ? activeId
      : grains[0]?.id;

  const newLoan = <GrainLoanModal fixedParty={party} products={products} />;

  if (grains.length === 0) {
    return (
      <div
        className="panel"
        style={{
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: 13.5 }}>
          No grain loans with {party.name} yet.
        </p>
        {newLoan}
      </div>
    );
  }

  const rows = loans.filter((l) => l.productId === selectedId);
  const registerForGrain = registerRows.filter((e) => e.productId === selectedId);
  const registerKg = round3(registerForGrain.reduce((s, e) => s + e.kg, 0));
  const unit = rows[0]?.unitName ?? registerForGrain[0]?.unitName ?? "";
  const sum = (
    direction: GrainLoanRow["direction"],
    pick: (l: GrainLoanRow) => number,
  ) =>
    round3(
      rows
        .filter((l) => l.direction === direction)
        .reduce((s, l) => s + pick(l), 0),
    );
  const lent = round3(sum("SHOP_LENT", (l) => l.quantity) + registerKg);
  const borrowed = sum("SHOP_BORROWED", (l) => l.quantity);
  const owesShop = round3(sum("SHOP_LENT", (l) => l.outstanding) + registerKg);
  const shopOwes = sum("SHOP_BORROWED", (l) => l.outstanding);
  // The card's own Record return, when there's exactly one open loan
  // that way; with several, each loan's row below has its own.
  const returnButton = (direction: GrainLoanRow["direction"]) => {
    const open = rows.filter(
      (l) => l.direction === direction && l.outstanding > 0,
    );
    if (open.length === 0) return null;
    if (open.length > 1)
      return (
        <p
          style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-muted)" }}
        >
          Record return on the loan below.
        </p>
      );
    return (
      <div style={{ marginTop: 10 }}>
        <GrainLoanReturnModal loan={open[0]} bankAccounts={bankAccounts} />
      </div>
    );
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div className="tabs" style={{ flex: 1 }}>
          {grains.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`tab${g.id === selectedId ? " active" : ""}`}
              onClick={() => setActiveId(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
        {newLoan}
      </div>

      <div className="stat-grid" style={{ marginBottom: 12 }}>
        {lent > 0 && (
          <div className="stat-card">
            <p className="stat-label">Lent by shop</p>
            <p className="stat-value tone-grain">
              {lent} {unit}
            </p>
          </div>
        )}
        {borrowed > 0 && (
          <div className="stat-card">
            <p className="stat-label">Borrowed by shop</p>
            <p className="stat-value tone-grain">
              {borrowed} {unit}
            </p>
          </div>
        )}
        <div className="stat-card">
          <p className="stat-label">
            {party.kind === "DEALER" ? "Dealer" : "Customer"} owes the shop
          </p>
          <p
            className={`stat-value${owesShop > 0 ? " tone-consigned" : " tone-primary"}`}
          >
            {owesShop} {unit}
          </p>
          {returnButton("SHOP_LENT")}
        </div>
        <div className="stat-card">
          <p className="stat-label">
            Shop owes {party.kind === "DEALER" ? "dealer" : "customer"}
          </p>
          <p
            className={`stat-value${shopOwes > 0 ? " tone-consigned" : " tone-primary"}`}
          >
            {shopOwes} {unit}
          </p>
          {returnButton("SHOP_BORROWED")}
        </div>
      </div>

      <div className="panel">
        <GrainLoanRecords
          loans={rows}
          registerRows={registerForGrain}
          showParty={false}
          products={products}
          bankAccounts={bankAccounts}
        />
      </div>
    </>
  );
}
