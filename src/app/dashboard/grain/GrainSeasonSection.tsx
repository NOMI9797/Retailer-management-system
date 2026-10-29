import { getGrainAccount, type GrainSeasonBlocker } from "@/modules/grain-account/actions";
import { CloseSeasonButton } from "@/modules/grain-account/components/CloseSeasonButton";
import { formatMoney, formatDate } from "@/lib/utils";

// A per-kg rate, to the paisa (break-even and buy-back rates differ by
// less than a rupee).
const perKg = (n: number) => `Rs ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The Grain page's Profit / Loss tab for the grain picked in the
// header: the season's account — money paid for the grain, money
// received for it, the grain still in hand at what it cost, and the
// profit / loss they come to (received − paid + stock value) — then
// the rate the grain in hand must sell above, what still has to happen
// before the season can close, the profit made each day, and past
// seasons.
export async function GrainSeasonSection({ productId }: { productId: string }) {
  const a = await getGrainAccount(productId);
  const unit = a.product.unitName;
  const up = a.profit >= 0;

  return (
    <div className="cf">
      <p className="cf-range">
        {a.product.name} · Season {a.seasonNumber}
        {a.seasonStartedAt && ` · since ${formatDate(a.seasonStartedAt)}`}
      </p>

      <div className="cf-hero cf-hero-4">
        <div className="cf-hero-card out">
          <p className="cf-hero-label">↓ Money paid for grain</p>
          <p className="cf-hero-value num">{formatMoney(a.season.paid)}</p>
          <p className="cf-hero-sub">
            {a.season.kgBought} {unit} bought
          </p>
        </div>
        <div className="cf-hero-card in">
          <p className="cf-hero-label">↑ Money received</p>
          <p className="cf-hero-value num">{formatMoney(a.season.received)}</p>
          <p className="cf-hero-sub">
            {a.season.kgSold} {unit} sold
            {a.opening && ` · incl. ${formatMoney(a.opening.udhaarValue)} opening Stock Udhaar (sold before the records)`}
          </p>
        </div>
        <div className="cf-hero-card">
          <p className="cf-hero-label">Stock in hand (at cost)</p>
          <p className="cf-hero-value num">{formatMoney(a.stockValue)}</p>
          <p className="cf-hero-sub">
            {a.ownKg} {unit} of the shop&apos;s own grain
          </p>
        </div>
        <div className={`cf-hero-card net ${up ? "up" : "down"}`}>
          <p className="cf-hero-label">{up ? "Profit so far" : "Loss so far"}</p>
          <p className="cf-hero-value num">
            {up ? "▲" : "▼"} {formatMoney(Math.abs(a.profit))}
          </p>
          <p className="cf-hero-sub">
            {a.opening
              ? "Received − paid + stock in hand − opening Stock Udhaar still to buy back (at break-even) · final when the season closes"
              : "Received − paid + stock in hand · final when the season closes"}
          </p>
          {a.estimate && (
            <p className="cf-hero-sub" style={{ marginTop: 6, color: "var(--grain-600)", fontWeight: 500 }}>
              ⚠ {a.estimate.kg} {unit} Stock Udhaar not bought yet — expected after buying it: about{" "}
              {a.estimate.profit >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(a.estimate.profit))} ({a.estimate.kg} {unit} × Rs {a.estimate.rate}, the last purchase
              rate)
            </p>
          )}
        </div>
      </div>

      <div className="stat-grid" style={{ margin: "16px 0" }}>
        <div className="stat-card">
          <p className="stat-label">Own grain in hand</p>
          <p className="stat-value tone-primary">
            {a.ownKg} {unit}
          </p>
          {(a.lentOut > 0 || a.atCustomerHomes > 0) && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
              incl.{" "}
              {[
                a.lentOut > 0 ? `${a.lentOut} ${unit} lent out` : null,
                a.atCustomerHomes > 0 ? `${a.atCustomerHomes} ${unit} still at customers' homes` : null,
              ]
                .filter(Boolean)
                .join(" and ")}
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">Break-even rate</p>
          {a.opening && a.opening.remainingKg > 0 ? (
            <>
              <p className="stat-value tone-grain">
                {perKg(a.opening.breakEven)} / {unit}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                Buy the Stock Udhaar back below this for profit · {a.opening.remainingKg} {unit} left
              </p>
            </>
          ) : a.breakEvenRate !== null ? (
            <>
              <p className="stat-value tone-grain">{formatMoney(a.breakEvenRate)} / {unit}</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                Sell above this for profit
              </p>
            </>
          ) : up ? (
            <>
              <p className="stat-value tone-primary">Already in profit</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                Every sale from here adds to it
              </p>
            </>
          ) : (
            <>
              <p className="stat-value tone-consigned">No grain left</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                {formatMoney(a.toRecover)} to recover from the next batches
              </p>
            </>
          )}
        </div>
        {a.opening && (
          <div className="stat-card">
            <p className="stat-label">Opening Stock Udhaar</p>
            <p className={`stat-value${a.opening.remainingKg > 0 ? " tone-consigned" : " tone-primary"}`}>
              {a.opening.remainingKg} {unit} left
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
              of {a.opening.totalKg} {unit}
              {a.opening.wastedKg > 0 &&
                ` (incl. ${a.opening.wastedKg} ${unit} of customers' grain wasted, ${formatMoney(a.opening.wastedValue)})`}{" "}
              · {formatMoney(a.opening.remainingValue)} at break-even · bought back {a.opening.filledKg} {unit}
            </p>
          </div>
        )}
        {a.stockUdhaar - (a.opening?.remainingKg ?? 0) > 0 && (
          <div className="stat-card">
            <p className="stat-label">Stock Udhaar (not bought yet)</p>
            <p className="stat-value tone-consigned">
              {Math.round((a.stockUdhaar - (a.opening?.remainingKg ?? 0)) * 1000) / 1000} {unit}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
              Buying it will lower this result
            </p>
          </div>
        )}
      </div>

      {(() => {
        const ready = a.blockers.length === 0;
        const nothingYet = a.season.paid === 0 && a.season.received === 0;
        // Every condition, done or not, so the shopkeeper sees how close
        // the season is to closing — not just what's missing.
        const steps: { key: GrainSeasonBlocker; label: string; left: number }[] = [
          { key: "OWN_STOCK", label: "Shop's own grain sold", left: a.shelfKg },
          { key: "STOCK_UDHAAR", label: "Stock Udhaar bought from customers", left: a.stockUdhaar },
          { key: "LENT_OUT", label: "Lent grain back (or paid for)", left: a.lentOut },
          { key: "BORROWED", label: "Borrowed grain given back (or paid for)", left: a.borrowed },
        ];
        return (
          <section className="panel season-close">
            <div className="season-close-head">
              <div>
                <h3>Close season {a.seasonNumber}</h3>
                <p>Locks this season&apos;s result as final and starts season {a.seasonNumber + 1} from zero.</p>
              </div>
              <span className={`season-close-status ${ready && !nothingYet ? "ready" : "pending"}`}>
                {ready && !nothingYet ? "Ready to close" : "Not ready yet"}
              </span>
            </div>

            <ul className="season-close-steps">
              {steps.map((step) => {
                const done = !a.blockers.includes(step.key);
                return (
                  <li key={step.key} className={done ? "done" : "todo"}>
                    <span className="season-close-mark" aria-hidden>
                      {done ? "✓" : ""}
                    </span>
                    <span className="season-close-label">{step.label}</span>
                    <span className="season-close-left num">
                      {done ? "Done" : `${Math.abs(step.left)} ${unit} left`}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="season-close-foot">
              <p>
                {nothingYet
                  ? "Nothing has been bought or sold this season yet."
                  : ready
                    ? `Final ${a.profit >= 0 ? "profit" : "loss"}: ${formatMoney(Math.abs(a.profit))}`
                    : "Finish the steps above to close the season."}
              </p>
              <CloseSeasonButton
                productId={a.product.id}
                productName={a.product.name}
                seasonNumber={a.seasonNumber}
                result={a.profit}
                disabled={!ready || nothingYet}
              />
            </div>
          </section>
        );
      })()}

      {a.opening && (
        <section className="panel cf-panel">
          <h3 className="cf-panel-title">Opening Stock Udhaar bought back</h3>
          {a.opening.fills.length === 0 ? (
            <p className="cf-empty">
              None bought back yet — new {a.product.name} stock fills it first ({a.opening.remainingKg} {unit} at{" "}
              {perKg(a.opening.breakEven)} / {unit}).
            </p>
          ) : (
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Bought back</th>
                  <th style={{ textAlign: "right" }}>Rate paid</th>
                  <th style={{ textAlign: "right" }}>Break-even</th>
                  <th style={{ textAlign: "right" }}>Profit / loss</th>
                </tr>
              </thead>
              <tbody>
                {a.opening.fills.map((f) => (
                  <tr key={f.id}>
                    <td>{formatDate(f.date)}</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {f.kg} {unit}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {perKg(f.rate)}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {perKg(a.opening!.breakEven)}
                    </td>
                    <td
                      className="num"
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color: f.gain >= 0 ? "var(--primary-600)" : "var(--consigned-600)",
                      }}
                    >
                      {f.gain >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(f.gain))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="panel cf-panel">
        <h3 className="cf-panel-title">Day by day</h3>
        {a.days.length === 0 ? (
          <p className="cf-empty">Nothing sold yet this season.</p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Sold for</th>
                <th style={{ textAlign: "right" }}>Cost of that grain</th>
                <th style={{ textAlign: "right" }}>Profit that day</th>
                <th style={{ textAlign: "right" }}>Season so far</th>
              </tr>
            </thead>
            <tbody>
              {a.days.map((d) => (
                <tr key={d.date}>
                  <td>
                    {formatDate(d.date)}
                    {d.uncostedKg > 0 && (
                      <span style={{ display: "block", fontSize: 12, color: "var(--grain-600)" }}>
                        {d.uncostedKg} {unit} customer grain — no cost until bought
                      </span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(d.soldFor)}
                  </td>
                  <td className="num" style={{ textAlign: "right", color: "var(--ink-muted)" }}>
                    {formatMoney(d.cost)}
                  </td>
                  <td
                    className="num"
                    style={{
                      textAlign: "right",
                      fontWeight: 600,
                      color: d.change >= 0 ? "var(--primary-600)" : "var(--consigned-600)",
                    }}
                  >
                    {d.change >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(d.change))}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {d.resultAfter >= 0 ? "Profit " : "Loss "}
                    {formatMoney(Math.abs(d.resultAfter))}
                  </td>
                </tr>
              ))}
              {Math.abs(a.otherAdjustments) >= 1 && (
                <tr>
                  <td colSpan={3} style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>
                    Opening: other stock adjustments (lent grain at the loan rate, older entries)
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {a.otherAdjustments >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(a.otherAdjustments))}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {a.otherAdjustments >= 0 ? "Profit " : "Loss "}
                    {formatMoney(Math.abs(a.otherAdjustments))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {a.closedSeasons.length > 0 && (
        <section className="panel cf-panel">
          <h3 className="cf-panel-title">Past seasons</h3>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Dates</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Received</th>
                <th style={{ textAlign: "right" }}>Final result</th>
              </tr>
            </thead>
            <tbody>
              {a.closedSeasons.map((s) => (
                <tr key={s.id}>
                  <td>
                    Season {s.seasonNumber}
                    {s.notes && (
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-muted)" }}>{s.notes}</span>
                    )}
                  </td>
                  <td>
                    {s.startedAt ? formatDate(s.startedAt) : "—"} – {formatDate(s.closedAt)}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(s.paid)}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {formatMoney(s.received)}
                  </td>
                  <td
                    className="num"
                    style={{
                      textAlign: "right",
                      fontWeight: 600,
                      color: s.result >= 0 ? "var(--primary-600)" : "var(--consigned-600)",
                    }}
                  >
                    {s.result >= 0 ? "▲ Profit" : "▼ Loss"} {formatMoney(Math.abs(s.result))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
