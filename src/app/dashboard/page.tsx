import Link from "next/link";
import { getDashboard } from "@/modules/dashboard/actions";
import { formatMoney, formatDate } from "@/lib/utils";
import { LOW_STOCK_LIMIT } from "@/modules/products/lowStock";

// The shopkeeper's first screen, laid out most-important-first: today's
// headline numbers (each against yesterday), the last 7 days, who owes
// what and each grain's position, then what needs attention and today's
// latest entries. Real data, queried fresh on every render — never
// cached, so an entry just made shows straight away.
export default async function DashboardPage() {
  const d = await getDashboard();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const biggestDay = Math.max(1, ...d.week.map((w) => Math.max(w.in, w.out)));
  const net = d.kpis.net.today;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting}</h1>
          <p>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="dash-actions">
          <Link href="/dashboard/daily-sales/new?tab=new-sale" className="btn btn-primary">
            + New sale
          </Link>
          <Link href="/dashboard/daily-sales/new?tab=udhaar-clearance" className="btn btn-ghost">
            Receive Udhaar
          </Link>
          <Link href="/dashboard/daily-sales/new?tab=daily-expense" className="btn btn-ghost">
            Expense
          </Link>
        </div>
      </div>

      {/* 1 — the shop's overall condition */}
      <h3 className="dash-section-title">Overall position</h3>
      <div className="dash-summary">
        <div className="dash-summary-card has">
          <p className="dash-kpi-label">Shop has</p>
          <p className="dash-summary-value num">{formatMoney(d.position.totalHas)}</p>
          <p className="dash-kpi-sub">Cash, bank, stock and money owed to the shop</p>
        </div>
        <div className="dash-summary-card owes">
          <p className="dash-kpi-label">Shop owes</p>
          <p className="dash-summary-value num">{formatMoney(d.position.totalOwes)}</p>
          <p className="dash-kpi-sub">To customers, dealers and unpaid expenses</p>
        </div>
        <div className={`dash-summary-card net ${d.position.netWorth >= 0 ? "up" : "down"}`}>
          <p className="dash-kpi-label">Net worth</p>
          <p className="dash-summary-value num">
            {d.position.netWorth < 0 && "− "}
            {formatMoney(Math.abs(d.position.netWorth))}
          </p>
          <p className="dash-kpi-sub">What the shop has, minus what it owes</p>
        </div>
      </div>

      <p className="dash-group-label has">What the shop has</p>
      <div className="dash-tiles">
        <PosTile label="Cash in hand" value={d.position.has.cashInHand} total={d.position.totalHas} href="/dashboard/cash-flow" />
        <PosTile
          label="Bank"
          value={d.position.has.bank}
          total={d.position.totalHas}
          href="/dashboard/bank-accounts"
          note={d.position.has.banks.map((b) => `${b.name} ${formatMoney(b.balance)}`).join(" · ")}
        />
        <PosTile label="Products stock" value={d.position.has.productStock} total={d.position.totalHas} href="/dashboard/products" note="At cost price" />
        <PosTile label="Grain stock" value={d.position.has.grainStock} total={d.position.totalHas} href="/dashboard/grain" note="Shop's own grain" />
        <PosTile label="Customers owe" value={d.position.has.customersOwe} total={d.position.totalHas} href="/dashboard/debts" />
        <PosTile label="Dealers owe" value={d.position.has.dealersOwe} total={d.position.totalHas} href="/dashboard/dealers" />
      </div>
      <p className="dash-group-label owes">What the shop owes</p>
      <div className="dash-tiles owes">
        <PosTile owes label="Owed to customers" value={d.position.owes.customers} total={d.position.totalOwes} href="/dashboard/debts" note="Borrowed money + unpaid grain purchases" />
        <PosTile owes label="Owed to dealers" value={d.position.owes.dealers} total={d.position.totalOwes} href="/dashboard/dealers" />
        <PosTile owes label="Expense Udhaar" value={d.position.owes.expenses} total={d.position.totalOwes} href="/dashboard/debts" note="Unpaid expenses" />
        {d.position.stockUdhaar.length > 0 && (
          <Link href="/dashboard/grain?tab=udhaar" className="dash-tile owes grain">
            <p className="dash-tile-label">Grain owed (Stock Udhaar)</p>
            <p className="dash-tile-value">
              {d.position.stockUdhaar.map((g) => (
                <span key={g.name}>
                  {g.name} {g.quantity} {g.unit}
                </span>
              ))}
            </p>
            <p className="dash-tile-note">Grain to give back to depositors</p>
          </Link>
        )}
      </div>

      {/* 2 — today at a glance, each against yesterday */}
      <h3 className="dash-section-title">Today</h3>
      <div className="dash-kpis">
        <Kpi label="Sales today" value={d.kpis.sales.today} prev={d.kpis.sales.yesterday} href="/dashboard/daily-sales" />
        <Kpi label="Money in" value={d.kpis.moneyIn.today} prev={d.kpis.moneyIn.yesterday} href="/dashboard/cash-flow" />
        <Kpi
          label="Money out"
          value={d.kpis.moneyOut.today}
          prev={d.kpis.moneyOut.yesterday}
          href="/dashboard/cash-flow"
          higherIsBad
        />
        <Link href="/dashboard/cash-flow" className={`dash-kpi net ${net >= 0 ? "up" : "down"}`}>
          <p className="dash-kpi-label">Net today</p>
          <p className="dash-kpi-value num">
            {net >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(net))}
          </p>
          <p className="dash-kpi-sub">{net >= 0 ? "Up today" : "Down today"}</p>
        </Link>
        <Link href="/dashboard/cash-flow" className="dash-kpi">
          <p className="dash-kpi-label">Cash in hand</p>
          <p className="dash-kpi-value num">{formatMoney(d.kpis.cashInHand.value)}</p>
          <p className="dash-kpi-sub">{d.kpis.cashInHand.closed ? "Counted at close" : "Expected in drawer"}</p>
        </Link>
      </div>

      {/* 3 — trend and grain */}
      <div className="dash-grid two">
        <section className="panel dash-panel">
          <div className="dash-panel-head">
            <h3>Last 7 days</h3>
            <span className="cf-legend">
              <i className="in" /> In <i className="out" /> Out
            </span>
          </div>
          <div className="cf-days dash-week">
            {d.week.map((w) => {
              const dayNet = w.in - w.out;
              return (
                <Link key={w.date} href={`/dashboard/cash-flow?date=${w.date}`} className="cf-day" title={formatDate(w.date)}>
                  <div className="cf-day-bars">
                    <div className="cf-day-bar in" style={{ height: `${(w.in / biggestDay) * 100}%` }} />
                    <div className="cf-day-bar out" style={{ height: `${(w.out / biggestDay) * 100}%` }} />
                  </div>
                  <span className="cf-day-label">
                    {new Date(`${w.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" })}
                  </span>
                  <span className={`cf-day-net ${dayNet >= 0 ? "up" : "down"}`}>
                    {w.in > 0 || w.out > 0 ? (dayNet >= 0 ? "▲" : "▼") : " "}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="panel dash-panel">
          <div className="dash-panel-head">
            <h3>Grain</h3>
            <Link href="/dashboard/grain" className="dash-link">
              Grain →
            </Link>
          </div>
          {d.grain.length === 0 ? (
            <p className="dash-empty">No grain in stock.</p>
          ) : (
            d.grain.map((g) => (
              <Link key={g.id} href={`/dashboard/grain?product=${g.id}`} className="dash-grain">
                <div className="dash-grain-top">
                  <strong>{g.name}</strong>
                  <span className="num">
                    {g.own} {g.unit} · {formatMoney(g.value)}
                  </span>
                </div>
                {(g.stockUdhaar > 0 || g.lentOut > 0 || g.atHomes > 0 || g.borrowed > 0) && (
                  <div className="dash-grain-tags">
                    {g.stockUdhaar > 0 && (
                      <span className="pay-badge pay-credit">
                        Stock Udhaar {g.stockUdhaar} {g.unit}
                      </span>
                    )}
                    {g.lentOut > 0 && (
                      <span className="pay-badge pay-account">
                        Lent {g.lentOut} {g.unit}
                      </span>
                    )}
                    {g.atHomes > 0 && (
                      <span className="pay-badge pay-account">
                        At customers&apos; homes {g.atHomes} {g.unit}
                      </span>
                    )}
                    {g.borrowed > 0 && (
                      <span className="pay-badge pay-mixed">
                        Borrowed {g.borrowed} {g.unit}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))
          )}
        </section>
      </div>

      {/* 4 — what to act on, and what just happened */}
      <div className="dash-grid two">
        <section className="panel dash-panel">
          <div className="dash-panel-head">
            <h3>Needs attention</h3>
          </div>
          <p className="dash-sub">Overdue Udhaar</p>
          {d.overdue.length === 0 ? (
            <p className="dash-empty">Nobody is overdue. 👍</p>
          ) : (
            d.overdue.map((o) => (
              <div key={o.customerId} className="dash-row">
                <Link href={`/dashboard/customers/${o.customerId}`} className="name-link">
                  {o.name}
                </Link>
                <span className="num dash-row-amount out">{formatMoney(o.overdue)} overdue</span>
                <Link href={`/dashboard/daily-sales/new?tab=udhaar-clearance&customer=${o.customerId}`} className="btn btn-primary dash-row-btn">
                  Receive
                </Link>
              </div>
            ))
          )}
          <div className="dash-sub-head">
            <p className="dash-sub">
              Low stock ({LOW_STOCK_LIMIT} or less)
              {d.lowStockCount > 0 && (
                <>
                  {" "}
                  · {d.lowStockCount} product{d.lowStockCount === 1 ? "" : "s"}
                  {d.outOfStockCount > 0 && <>, {d.outOfStockCount} out of stock</>}
                </>
              )}
            </p>
            {d.lowStockCount > 0 && (
              <Link href="/dashboard/products/low-stock" className="dash-link">
                View all →
              </Link>
            )}
          </div>
          {d.lowStock.length === 0 ? (
            <p className="dash-empty">All products are stocked.</p>
          ) : (
            d.lowStock.map((p) => (
              <div key={p.id} className="dash-row">
                <span>{p.name}</span>
                <span className={`num dash-row-amount ${p.quantity <= 0 ? "out" : ""}`}>
                  {p.quantity <= 0 ? "Out of stock" : `${p.left} left`}
                </span>
                <Link href="/dashboard/daily-sales/new?tab=dealer-products" className="btn btn-ghost dash-row-btn">
                  Buy
                </Link>
              </div>
            ))
          )}
          {d.lowStockCount > d.lowStock.length && (
            <Link href="/dashboard/products/low-stock" className="dash-more">
              + {d.lowStockCount - d.lowStock.length} more — see all low stock →
            </Link>
          )}
        </section>

        <section className="panel dash-panel">
          <div className="dash-panel-head">
            <h3>Today&apos;s entries</h3>
            <Link href="/dashboard/daily-sales" className="dash-link">
              View all →
            </Link>
          </div>
          {d.recent.length === 0 ? (
            <p className="dash-empty">Nothing recorded yet today.</p>
          ) : (
            d.recent.map((r) => (
              <div key={r.id} className="dash-row">
                <span className="dash-entry">
                  <Link href={r.href} className="name-link">
                    {r.name}
                  </Link>
                  <span className="dash-entry-label">{r.label}</span>
                </span>
                <span className={`num dash-row-amount ${r.side === "CREDIT" ? "in" : "out"}`}>
                  {r.stockOnly ? r.detail : `${r.side === "CREDIT" ? "+" : "−"} ${formatMoney(r.amount)}`}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}

// A headline number with its change against yesterday. For money out,
// going up is the bad direction (red), so the colours flip.
function Kpi({
  label,
  value,
  prev,
  href,
  higherIsBad,
}: {
  label: string;
  value: number;
  prev: number;
  href: string;
  higherIsBad?: boolean;
}) {
  const diff = value - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  const good = higherIsBad ? diff <= 0 : diff >= 0;
  return (
    <Link href={href} className="dash-kpi">
      <p className="dash-kpi-label">{label}</p>
      <p className="dash-kpi-value num">{formatMoney(value)}</p>
      <p className={`dash-kpi-sub ${diff === 0 ? "" : good ? "good" : "bad"}`}>
        {diff === 0
          ? "Same as yesterday"
          : `${diff > 0 ? "▲" : "▼"} ${pct !== null ? `${Math.abs(pct)}%` : formatMoney(Math.abs(diff))} vs yesterday`}
      </p>
    </Link>
  );
}

// One part of the overall position: its amount, what it is, and a thin
// bar for its share of the total it belongs to.
function PosTile({
  label,
  value,
  total,
  href,
  note,
  owes,
}: {
  label: string;
  value: number;
  total: number;
  href: string;
  note?: string;
  owes?: boolean;
}) {
  const share = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <Link href={href} className={`dash-tile${owes ? " owes" : ""}`}>
      <p className="dash-tile-label">{label}</p>
      <p className="dash-tile-value num">{formatMoney(value)}</p>
      <div className="dash-tile-bar">
        <span style={{ width: `${share}%` }} />
      </div>
      <p className="dash-tile-note">{note ?? `${Math.round(share)}% of total`}</p>
    </Link>
  );
}
