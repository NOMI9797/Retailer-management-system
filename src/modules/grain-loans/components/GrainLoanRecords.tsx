"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  deleteGrainLoan,
  deleteGrainLoanReturn,
  type GrainLoanRow,
} from "../actions";
import { GrainLoanModal } from "./GrainLoanModal";
import { GrainLoanReturnModal } from "./GrainLoanReturnModal";
import { showToast } from "@/components/shared/toastStore";
import { formatMoney, formatDate } from "@/lib/utils";
import type { ActionResult } from "@/lib/actionResult";
import type { listAreas } from "@/modules/settings/areas.actions";
import type { AdvanceRegisterRow } from "@/modules/grain-register/actions";
import { AdvanceRegisterActions, RegisterBadge } from "@/modules/grain-register/components/AdvanceRegisterActions";

type Area = Awaited<ReturnType<typeof listAreas>>[number];

type TableProps = {
  loans: GrainLoanRow[];
  showParty?: boolean;
  showProduct?: boolean;
  products?: { id: string; name: string }[];
  areas?: Area[];
  dealers?: { id: string; name: string }[];
  bankAccounts?: { id: string; name: string }[];
  emptyText?: string;
  // Grain lent to this customer per the register (customer page) —
  // listed among the loans, newest first, marked "From register".
  registerRows?: AdvanceRegisterRow[];
};

// Grain loan records — on the Grain page's Loans tab (all parties, one
// grain) and a customer's / dealer's Grain loans tab (one party). Two
// small tabs: Loans (each loan, what's been given back and what's still
// owed, with Record return / Edit / Delete) and Returns (every return
// as its own record, each editable). Pure display: rows come from the
// page's server fetch; the open tab is local UI state.
export function GrainLoanRecords(props: TableProps) {
  const [view, setView] = useState<"LOANS" | "RETURNS">("LOANS");
  const returnCount = props.loans.reduce((n, l) => n + l.returns.length, 0);
  return (
    <>
      <div style={{ padding: "12px 16px 0" }}>
        <div className="stock-toggle" style={{ maxWidth: 320 }}>
          <button
            type="button"
            className={view === "LOANS" ? "active" : ""}
            onClick={() => setView("LOANS")}
          >
            Loans ({props.loans.length + (props.registerRows?.length ?? 0)})
          </button>
          <button
            type="button"
            className={view === "RETURNS" ? "active" : ""}
            onClick={() => setView("RETURNS")}
          >
            Returns ({returnCount})
          </button>
        </div>
      </div>
      {view === "LOANS" ? (
        <GrainLoansTable {...props} />
      ) : (
        <GrainLoanReturnsTable {...props} />
      )}
    </>
  );
}

function GrainLoansTable({
  loans,
  showParty = true,
  showProduct = false,
  products = [],
  areas = [],
  dealers = [],
  bankAccounts = [],
  emptyText = "No grain loans yet.",
  registerRows = [],
}: TableProps) {
  const columns = 8 + (showParty ? 1 : 0) + (showProduct ? 1 : 0);
  const items = [
    ...loans.map((loan) => ({ kind: "loan" as const, date: new Date(loan.loanDate).getTime(), loan })),
    ...registerRows.map((e) => ({ kind: "register" as const, date: new Date(e.date).getTime(), e })),
  ].sort((a, b) => b.date - a.date);

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          {showParty && <th>Party</th>}
          {showProduct && <th>Grain</th>}
          <th>Type</th>
          <th style={{ textAlign: "right" }}>Quantity</th>
          <th style={{ textAlign: "right" }}>Rate</th>
          <th style={{ textAlign: "right" }}>Given back</th>
          <th style={{ textAlign: "right" }}>Still owed</th>
          <th>Ref</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={columns}>{emptyText}</td>
          </tr>
        ) : (
          items.map((item) => {
            if (item.kind === "register") {
              const e = item.e;
              return (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}</td>
                  {showParty && <td></td>}
                  {showProduct && <td>{e.productName}</td>}
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="pay-badge pay-account" style={{ marginRight: 6 }}>
                      Lent
                    </span>
                    <RegisterBadge />
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {e.kg} {e.unitName}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    <span className="dash">—</span>
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    <span className="dash">—</span>
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--grain-600)" }}>
                    {e.kg} {e.unitName}
                  </td>
                  <td style={{ color: "var(--ink-muted)", fontSize: 13 }}>{e.note}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <AdvanceRegisterActions row={e} grains={products} />
                  </td>
                </tr>
              );
            }
            const loan = item.loan;
            const lent = loan.direction === "SHOP_LENT";
            return (
              <tr key={loan.id}>
                <td>{formatDate(loan.loanDate)}</td>
                {showParty && (
                  <td>
                    <Link
                      href={loan.party.href}
                      className="name-link"
                      style={{ marginRight: 8 }}
                    >
                      {loan.party.name}
                    </Link>
                    <span
                      className={`pay-badge ${loan.party.kind === "DEALER" ? "pay-account" : "pay-mixed"}`}
                    >
                      {loan.party.kind === "DEALER" ? "Dealer" : "Customer"}
                    </span>
                  </td>
                )}
                {showProduct && <td>{loan.productName}</td>}
                <td>
                  <span
                    className={`pay-badge ${lent ? "pay-account" : "pay-credit"}`}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {lent ? "Lent" : "Borrowed"}
                  </span>
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {loan.quantity} {loan.unitName}
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {formatMoney(loan.rate)}
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {loan.returns.length === 0 ? (
                    <span className="dash">—</span>
                  ) : (
                    `${Math.round((loan.returned + loan.paid) * 1000) / 1000} ${loan.unitName}`
                  )}
                </td>
                <td
                  className="num"
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    color:
                      loan.outstanding > 0
                        ? lent
                          ? "var(--grain-600)"
                          : "var(--consigned-600)"
                        : undefined,
                  }}
                >
                  {loan.outstanding > 0 ? (
                    `${loan.outstanding} ${loan.unitName}`
                  ) : (
                    <span className="status-badge">Cleared</span>
                  )}
                </td>
                <td style={{ color: "var(--ink-muted)", fontSize: 13 }}>
                  {loan.reference}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {loan.outstanding > 0 && (
                    <GrainLoanReturnModal
                      loan={loan}
                      bankAccounts={bankAccounts}
                    />
                  )}
                  <GrainLoanModal
                    loan={loan}
                    trigger="icon"
                    products={showProduct ? products : []}
                    fixedParty={
                      showParty
                        ? undefined
                        : {
                            kind: loan.party.kind,
                            id: loan.party.id,
                            name: loan.party.name,
                          }
                    }
                    areas={areas}
                    dealers={dealers}
                  />
                  <ConfirmDelete
                    prompt="Delete this loan? Stock will be reversed."
                    onDelete={() => deleteGrainLoan(loan.id)}
                    done="Grain loan deleted"
                  />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

// Every return across the loans, newest first, one full record each.
function GrainLoanReturnsTable({
  loans,
  showParty = true,
  showProduct = false,
  bankAccounts = [],
}: TableProps) {
  const rows = loans
    .flatMap((loan) => loan.returns.map((ret) => ({ loan, ret })))
    .sort(
      (a, b) =>
        new Date(b.ret.returnDate).getTime() -
        new Date(a.ret.returnDate).getTime(),
    );
  const columns = 8 + (showParty ? 1 : 0) + (showProduct ? 1 : 0);

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          {showParty && <th>Party</th>}
          {showProduct && <th>Grain</th>}
          <th>Loan</th>
          <th style={{ textAlign: "right" }}>Grain back</th>
          <th style={{ textAlign: "right" }}>Settled in money</th>
          <th style={{ textAlign: "right" }}>Amount</th>
          <th>Payment</th>
          <th>Ref</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={columns}>No returns recorded yet.</td>
          </tr>
        ) : (
          rows.map(({ loan, ret }) => {
            const lent = loan.direction === "SHOP_LENT";
            const unit = loan.unitName;
            return (
              <tr key={ret.id}>
                <td>{formatDate(ret.returnDate)}</td>
                {showParty && (
                  <td>
                    <Link href={loan.party.href} className="name-link">
                      {loan.party.name}
                    </Link>
                  </td>
                )}
                {showProduct && <td>{loan.productName}</td>}
                <td>
                  <span
                    className={`pay-badge ${lent ? "pay-account" : "pay-credit"}`}
                    style={{ whiteSpace: "nowrap", marginRight: 6 }}
                  >
                    {lent ? "Lent" : "Borrowed"}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                    {loan.quantity} {unit} · {formatDate(loan.loanDate)}
                  </span>
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {ret.quantityReturned > 0 ? (
                    `${ret.quantityReturned} ${unit}`
                  ) : (
                    <span className="dash">—</span>
                  )}
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {ret.quantityPaid > 0 ? (
                    `${ret.quantityPaid} ${unit}`
                  ) : (
                    <span className="dash">—</span>
                  )}
                </td>
                <td
                  className="num"
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    color:
                      ret.amount > 0
                        ? lent
                          ? "var(--primary-600)"
                          : "var(--consigned-600)"
                        : undefined,
                  }}
                >
                  {ret.amount > 0 ? (
                    formatMoney(ret.amount)
                  ) : (
                    <span className="dash">—</span>
                  )}
                </td>
                <td>
                  {ret.paymentMethod ? (
                    <span
                      className={`pay-badge ${ret.paymentMethod === "ACCOUNT" ? "pay-account" : "pay-cash"}`}
                    >
                      {ret.paymentMethod === "ACCOUNT"
                        ? (ret.bankAccountName ?? "Account")
                        : "Cash"}
                    </span>
                  ) : (
                    <span className="dash">—</span>
                  )}
                </td>
                <td style={{ color: "var(--ink-muted)", fontSize: 13 }}>
                  {ret.reference ?? ""}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <GrainLoanReturnModal
                    loan={loan}
                    ret={ret}
                    bankAccounts={bankAccounts}
                  />
                  <ConfirmDelete
                    prompt="Delete this return?"
                    onDelete={() => deleteGrainLoanReturn(ret.id)}
                    done="Return deleted"
                  />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

// Same confirm-inline pattern as DeleteGrainSettlementButton.
function ConfirmDelete({
  prompt,
  onDelete,
  done,
}: {
  prompt: string;
  onDelete: () => Promise<ActionResult<unknown>>;
  done: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await onDelete();
    setIsDeleting(false);
    setConfirming(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast(done);
    router.refresh();
  }

  if (confirming) {
    return (
      <>
        <span
          style={{
            fontSize: 13,
            color: "var(--consigned-600)",
            margin: "0 8px",
          }}
        >
          {prompt}
        </span>
        <button
          className="btn btn-primary"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => setConfirming(false)}
          disabled={isDeleting}
        >
          Cancel
        </button>
      </>
    );
  }

  return (
    <>
      {error && (
        <span
          style={{
            display: "block",
            fontSize: 12.5,
            color: "var(--consigned-600)",
            margin: "4px 0",
            whiteSpace: "normal",
          }}
        >
          {error}
        </span>
      )}
      <button
        className="icon-btn"
        onClick={() => setConfirming(true)}
        title="Delete"
      >
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
        </svg>
      </button>
    </>
  );
}
