"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { formatMoney, formatDate } from "@/lib/utils";
import { Pagination } from "@/modules/products/components/Pagination";
import { EditSaleModal } from "@/modules/daily-sales/components/EditSaleModal";
import { DeleteSaleButton } from "@/modules/daily-sales/components/DeleteSaleButton";
import { buildDailySalesHref, type DailySalesSearchParams } from "./searchParamsHref";
import type { listDailySales } from "@/modules/daily-sales/actions";
import type { listProducts } from "@/modules/products/actions";

type Result = Awaited<ReturnType<typeof listDailySales>>;
type Product = Awaited<ReturnType<typeof listProducts>>["products"][number];

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Cash",
  ACCOUNT: "On account",
  CREDIT: "Udhaar",
  MIXED: "Mixed",
};

const PAYMENT_CLASS: Record<string, string> = {
  CASH: "pay-cash",
  ACCOUNT: "pay-account",
  CREDIT: "pay-credit",
  MIXED: "pay-mixed",
};

// Client leaf for the shop-wide Sales History table — same split
// SalesHistoryTable (Server Component, does the listDailySales fetch)
// / this component (interactive rows) follows everywhere else in the
// app (see GrainStockList/GrainBatchList). Edit/Delete reuse the EXACT
// same EditSaleModal/DeleteSaleButton the customer detail page's own
// Purchase History panel already uses — one implementation of
// "reverse and reapply a sale's stock/batch/ledger effects," not a
// second copy here. Only shown on real SALE rows, never on an Udhaar
// Clearance row (a repayment, not a sale — same "no edit/delete here"
// rule PurchaseHistoryList follows for those).
export function SalesHistoryList({
  result,
  searchParams,
  products,
  bankAccounts = [],
}: {
  result: Result;
  searchParams: DailySalesSearchParams;
  products: Product[];
  bankAccounts?: { id: string; name: string }[];
}) {
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  let lastDateKey: string | null = null;
  const pageTotal = result.sales.reduce((sum, s) => sum + (s.kind === "SALE" ? s.total : s.amount), 0);

  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "36%" }}>Customer</th>
              <th>Items</th>
              <th>Payment</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.sales.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={5}>No sales recorded yet.</td>
              </tr>
            ) : (
              result.sales.map((row) => {
                const dateKey = formatDate(row.saleDate);
                const isNewDay = dateKey !== lastDateKey;
                lastDateKey = dateKey;
                const buyerName = row.kind === "SALE" ? row.buyerName : row.customerName;
                const initial = buyerName.charAt(0).toUpperCase();

                return (
                  <Fragment key={row.id}>
                    {isNewDay && (
                      <tr className="table-date-header">
                        <td colSpan={5}>{dateKey}</td>
                      </tr>
                    )}
                    <tr>
                      <td>
                        <div className="cust-cell">
                          <div className="cust-avatar">{initial}</div>
                          <span style={{ fontWeight: 500 }}>
                            {buyerName}
                            {row.kind === "SALE" && row.buyerKind === "DEALER" && (
                              <span className="pay-badge pay-mixed" style={{ marginLeft: 8 }}>
                                Dealer
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      {row.kind === "SALE" ? (
                        <>
                          <td>
                            {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
                          </td>
                          <td>
                            {row.paymentSummary && (
                              <span className={`pay-badge ${PAYMENT_CLASS[row.paymentSummary]}`}>
                                {PAYMENT_LABEL[row.paymentSummary]}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(row.total)}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ color: "var(--ink-muted)" }}>—</td>
                          <td>
                            <span className="pay-badge pay-udhaar-cleared">Udhaar Cleared</span>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: "var(--primary-600)" }}>
                            +{formatMoney(row.amount)}
                          </td>
                        </>
                      )}
                      <td>
                        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                          {row.kind === "SALE" && (
                            <>
                              <button
                                className="icon-btn"
                                onClick={() => setEditingSaleId(row.id)}
                                title="Edit"
                              >
                                <svg className="icon" viewBox="0 0 24 24">
                                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                                </svg>
                              </button>
                              <DeleteSaleButton saleId={row.id} />
                            </>
                          )}
                          <Link
                            className="btn btn-ghost"
                            href={
                              row.kind === "SALE" && row.buyerKind === "DEALER"
                                ? `/dashboard/dealers/${row.buyerId}`
                                : `/dashboard/customers/${row.kind === "SALE" ? row.buyerId : row.customerId}`
                            }
                          >
                            {row.kind === "SALE" && row.buyerKind === "DEALER" ? "View dealer" : "View customer"}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {result.sales.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 20px",
              fontSize: 12,
              color: "var(--ink-muted)",
            }}
          >
            <span>
              {result.sales.length} sale{result.sales.length === 1 ? "" : "s"} · {formatMoney(pageTotal)} total
            </span>
            <span>
              {result.totalPages > 1 ? `Page ${result.page} of ${result.totalPages}` : "Showing all results"}
            </span>
          </div>
        )}
      </div>

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        totalCount={result.totalCount}
        hrefFor={(p) => buildDailySalesHref(searchParams, { page: String(p) })}
      />

      {editingSaleId && (
        <EditSaleModal
          saleId={editingSaleId}
          products={products}
          bankAccounts={bankAccounts}
          onClose={() => setEditingSaleId(null)}
        />
      )}
    </>
  );
}
