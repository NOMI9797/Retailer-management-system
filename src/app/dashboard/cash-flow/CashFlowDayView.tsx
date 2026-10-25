import Link from "next/link";
import { getCashFlowForDate, getCashFlowOverview, type CashFlowPeriod } from "@/modules/cash-flow/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { DayCloseForm } from "@/modules/cash-flow/components/DayCloseForm";
import { EditOpeningBalanceButton } from "@/modules/cash-flow/components/EditOpeningBalanceButton";
import { EditClosingBalanceButton } from "@/modules/cash-flow/components/EditClosingBalanceButton";
import { buildDailySalesHref } from "../daily-sales/searchParamsHref";
import type { LedgerCategory } from "@/modules/ledger/actions";

const CATEGORY_LABEL: Record<LedgerCategory, string> = {
  SALES: "Sales",
  UDHAAR: "Udhaar",
  LOANS: "Loans",
  DEALERS: "Dealers",
  EXPENSES: "Expenses",
  GRAIN: "Grain",
};

// The Cash flow page for one day, week or month, top to bottom:
// money in / out / net (cash + bank), where it moved (cash, each bank
// account, and Udhaar apart since no money moves), a breakdown by kind
// of entry, per-day bars for a week or month, and — for a single day —
// the cash drawer (opening + in − out = expected, then the counted
// close). Every number comes from the same records as Daily sales.
export async function CashFlowDayView({ date, period }: { date: string; period: CashFlowPeriod }) {
  const [flow, register] = await Promise.all([
    getCashFlowOverview(date, period),
    period === "day" ? getCashFlowForDate(date) : Promise.resolve(null),
  ]);
  const up = flow.net >= 0;
  const rangeLabel =
    period === "day" ? formatDate(date) : `${formatDate(flow.fromDate)} – ${formatDate(flow.toDate)}`;

  const categories = (Object.keys(flow.byCategory) as LedgerCategory[])
    .map((key) => ({ key, ...flow.byCategory[key] }))
    .filter((c) => c.in > 0 || c.out > 0)
    .sort((a, b) => b.in + b.out - (a.in + a.out));
  const biggest = Math.max(1, ...categories.map((c) => Math.max(c.in, c.out)));
  const biggestDay = Math.max(1, ...flow.days.map((d) => Math.max(d.in, d.out)));

  return (
    <div className="cf">
      <p className="cf-range">{rangeLabel}</p>

      {/* 1 — the three numbers that matter */}
      <div className="cf-hero">
        <div className="cf-hero-card in">
          <p className="cf-hero-label">↑ Money in</p>
          <p className="cf-hero-value num">{formatMoney(flow.moneyIn)}</p>
          <p className="cf-hero-sub">
            {flow.entriesIn} {flow.entriesIn === 1 ? "entry" : "entries"} · cash + bank
          </p>
        </div>
        <div className="cf-hero-card out">
          <p className="cf-hero-label">↓ Money out</p>
          <p className="cf-hero-value num">{formatMoney(flow.moneyOut)}</p>
          <p className="cf-hero-sub">
            {flow.entriesOut} {flow.entriesOut === 1 ? "entry" : "entries"} · cash + bank
          </p>
        </div>
        <div className={`cf-hero-card net ${up ? "up" : "down"}`}>
          <p className="cf-hero-label">Net</p>
          <p className="cf-hero-value num">
            {up ? "▲" : "▼"} {formatMoney(Math.abs(flow.net))}
          </p>
          <p className="cf-hero-sub">
            {flow.net === 0 ? "Balanced" : up ? "Up — more came in than went out" : "Down — more went out than came in"}
          </p>
        </div>
      </div>

      {/* 2 — where the money moved */}
      <section className="panel cf-panel">
        <h3 className="cf-panel-title">Where it moved</h3>
        <table className="cf-table">
          <thead>
            <tr>
              <th></th>
              <th style={{ textAlign: "right" }}>In</th>
              <th style={{ textAlign: "right" }}>Out</th>
              <th style={{ textAlign: "right" }}>Net</th>
            </tr>
          </thead>
          <tbody>
            <MoveRow label="Cash" flowIn={flow.cash.in} flowOut={flow.cash.out} strong />
            <MoveRow label="Bank" flowIn={flow.bank.in} flowOut={flow.bank.out} strong />
            {flow.bankAccounts.map((a) => (
              <MoveRow key={a.name} label={a.name} flowIn={a.in} flowOut={a.out} indent />
            ))}
          </tbody>
        </table>
        {(flow.udhaar.given > 0 || flow.udhaar.taken > 0) && (
          <p className="cf-udhaar">
            On Udhaar (no money moved): given <strong>{formatMoney(flow.udhaar.given)}</strong> · taken{" "}
            <strong>{formatMoney(flow.udhaar.taken)}</strong>
          </p>
        )}
      </section>

      {/* 3 — breakdown by kind of entry */}
      <section className="panel cf-panel">
        <div className="cf-panel-head">
          <h3 className="cf-panel-title">Breakdown</h3>
          <span className="cf-legend">
            <i className="in" /> In <i className="out" /> Out
          </span>
        </div>
        {categories.length === 0 ? (
          <p className="cf-empty">No money moved {period === "day" ? "this day" : `this ${period}`}.</p>
        ) : (
          <div className="cf-bars">
            {categories.map((c) => (
              <div key={c.key} className="cf-bar-row">
                <span className="cf-bar-label">{CATEGORY_LABEL[c.key]}</span>
                <div className="cf-bar-track">
                  {c.in > 0 && (
                    <div className="cf-bar in" style={{ width: `${(c.in / biggest) * 100}%` }}>
                      <span>+{formatMoney(c.in)}</span>
                    </div>
                  )}
                  {c.out > 0 && (
                    <div className="cf-bar out" style={{ width: `${(c.out / biggest) * 100}%` }}>
                      <span>−{formatMoney(c.out)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4 — week / month: each day */}
      {period !== "day" && (
        <section className="panel cf-panel">
          <h3 className="cf-panel-title">Day by day</h3>
          <div className="cf-days">
            {flow.days.map((d) => {
              const net = d.in - d.out;
              return (
                <Link key={d.date} href={`/dashboard/cash-flow?date=${d.date}`} className="cf-day" title={formatDate(d.date)}>
                  <div className="cf-day-bars">
                    <div className="cf-day-bar in" style={{ height: `${(d.in / biggestDay) * 100}%` }} />
                    <div className="cf-day-bar out" style={{ height: `${(d.out / biggestDay) * 100}%` }} />
                  </div>
                  <span className="cf-day-label">{Number(d.date.slice(8))}</span>
                  <span className={`cf-day-net ${net >= 0 ? "up" : "down"}`}>
                    {d.in > 0 || d.out > 0 ? (net >= 0 ? "▲" : "▼") : "\u00a0"}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 5 — the cash drawer, for one day */}
      {register && (
        <section className="panel cf-panel">
          <h3 className="cf-panel-title">Cash drawer</h3>
          <div className="cf-drawer">
            <span>
              Opening <strong className="num">{formatMoney(register.openingBalance)}</strong>
              {!register.needsOpeningBalance && (
                <EditOpeningBalanceButton date={date} openingBalance={register.openingBalance} />
              )}
            </span>
            <span className="cf-op in">+ {formatMoney(register.cashIn)}</span>
            <span className="cf-op out">− {formatMoney(register.cashOut)}</span>
            <span>
              = Expected <strong className="num">{formatMoney(register.expectedClosing)}</strong>
            </span>
          </div>
          <div className="cf-drawer-close">
            {register.actualClosing !== null && (
              <span>
                Counted <strong className="num">{formatMoney(register.actualClosing)}</strong>
                <EditClosingBalanceButton date={date} actualClosing={register.actualClosing} />
              </span>
            )}
            {register.variance !== null && (
              <span
                className={`cf-variance ${register.variance === 0 ? "" : register.variance > 0 ? "up" : "down"}`}
              >
                {register.variance === 0
                  ? "Matches exactly"
                  : register.variance > 0
                    ? `▲ ${formatMoney(register.variance)} more than expected`
                    : `▼ ${formatMoney(Math.abs(register.variance))} short`}
              </span>
            )}
            <DayCloseForm date={date} needsOpeningBalance={register.needsOpeningBalance} isClosed={register.isClosed} />
          </div>
        </section>
      )}

      <p className="cf-footer">
        Every entry behind these numbers:{" "}
        <Link href={buildDailySalesHref({}, { date: period === "day" ? date : undefined })}>Daily sales →</Link>
      </p>
    </div>
  );
}

function MoveRow({
  label,
  flowIn,
  flowOut,
  strong,
  indent,
}: {
  label: string;
  flowIn: number;
  flowOut: number;
  strong?: boolean;
  indent?: boolean;
}) {
  const net = flowIn - flowOut;
  return (
    <tr className={indent ? "cf-sub" : undefined}>
      <td style={{ fontWeight: strong ? 600 : 400, paddingLeft: indent ? 28 : undefined }}>{label}</td>
      <td className="num" style={{ textAlign: "right", color: "var(--primary-600)" }}>
        {flowIn ? `+ ${formatMoney(flowIn)}` : "—"}
      </td>
      <td className="num" style={{ textAlign: "right", color: "var(--consigned-600)" }}>
        {flowOut ? `− ${formatMoney(flowOut)}` : "—"}
      </td>
      <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
        {net === 0 ? "—" : `${net > 0 ? "▲" : "▼"} ${formatMoney(Math.abs(net))}`}
      </td>
    </tr>
  );
}
