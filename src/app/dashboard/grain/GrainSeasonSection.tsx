import { getGrainAccount, type GrainSeasonBlocker } from "@/modules/grain-account/actions";
import { CloseSeasonButton } from "@/modules/grain-account/components/CloseSeasonButton";
import { formatMoney, formatDate } from "@/lib/utils";

// A per-kg rate, to the paisa (break-even and buy-back rates differ by
// less than a rupee).
const perKg = (n: number) => `Rs ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The Grain page's Profit / Loss tab for the grain picked in the
// header, the simple way: money paid for the grain and money received
// for it this season, the grain still in hand, and the break-even rate
// they set — profit / loss itself is worked out only when the season
// closes (received − paid). Then what still has to happen before it can
// close, the opening Stock Udhaar bought back, and past seasons.
export async function GrainSeasonSection({ productId }: { productId: string }) {
  const a = await getGrainAccount(productId);
  const unit = a.product.unitName;
  const be = a.breakEven;

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
        <div className="cf-hero-card net">
          <p className="cf-hero-label">Profit / loss</p>
          <p className="cf-hero-value num" style={{ fontSize: 20 }}>
            When the season closes
          </p>
          <p className="cf-hero-sub">Money received − money paid, worked out at Close season</p>
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
              {[
                a.lentOut > 0 ? `${a.lentOut} ${unit} lent out` : null,
                a.atCustomerHomes > 0 ? `${a.atCustomerHomes} ${unit} Advance stock at customers' homes` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">Break-even rate</p>
          {be.kind === "BUY_BELOW" ? (
            <>
              <p className={`stat-value ${be.rate > 0 ? "tone-grain" : "tone-consigned"}`}>
                {perKg(be.rate)} / {unit}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                {be.rate > 0
                  ? `Buy the ${be.owedKg} ${unit} owed (Stock Udhaar) below this to come out even`
                  : `More already paid than received — every ${unit} of the ${be.owedKg} ${unit} owed adds to the loss`}
              </p>
            </>
          ) : be.kind === "SELL_ABOVE" ? (
            <>
              <p className="stat-value tone-grain">
                {perKg(be.rate)} / {unit}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                Sell the {be.ownKg} {unit} in hand above this to get back what&apos;s been paid
              </p>
            </>
          ) : be.kind === "RECOVERED" ? (
            <>
              <p className="stat-value tone-primary">Already recovered</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                {formatMoney(be.surplus)} more received than paid so far
              </p>
            </>
          ) : (
            <>
              <p className="stat-value tone-consigned">No grain left</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
                {formatMoney(be.short)} more paid than received
              </p>
            </>
          )}
        </div>
        {a.stockUdhaar > 0 && (
          <div className="stat-card">
            <p className="stat-label">Stock Udhaar (to buy back)</p>
            <p className="stat-value tone-consigned">
              {a.stockUdhaar} {unit}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
              Worth {formatMoney(a.stockUdhaarValue ?? 0)}
              {a.opening && a.opening.filledKg > 0 && ` · ${a.opening.filledKg} ${unit} of the opening bought back`}
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
                    ? `Final ${a.result >= 0 ? "profit" : "loss"}: ${formatMoney(Math.abs(a.result))} (money received − money paid)`
                    : "Finish the steps above to close the season."}
              </p>
              <CloseSeasonButton
                productId={a.product.id}
                productName={a.product.name}
                seasonNumber={a.seasonNumber}
                result={a.result}
                disabled={!ready || nothingYet}
              />
            </div>
          </section>
        );
      })()}

      {a.opening && a.opening.fills.length > 0 && (
        <section className="panel cf-panel">
          <h3 className="cf-panel-title">Opening Stock Udhaar bought back</h3>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Bought back</th>
                <th style={{ textAlign: "right" }}>Rate paid</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
