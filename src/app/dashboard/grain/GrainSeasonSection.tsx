import { getGrainAccount, type GrainSeasonBlocker } from "@/modules/grain-account/actions";
import { CloseSeasonButton } from "@/modules/grain-account/components/CloseSeasonButton";
import { formatMoney, formatDate } from "@/lib/utils";

// The Grain page's Profit / Loss tab for the grain picked in the
// header: the season's running account — money paid for the grain,
// money received for it, and what that leaves (profit, or loss still
// to recover) — then the grain still in hand and the rate it must sell
// above to come out even, what still has to happen before the season
// can close, each day's movement, and past seasons.
export async function GrainSeasonSection({ productId }: { productId: string }) {
  const a = await getGrainAccount(productId);
  const unit = a.product.unitName;
  const up = a.season.result >= 0;

  return (
    <div className="cf">
      <p className="cf-range">
        {a.product.name} · Season {a.seasonNumber}
        {a.seasonStartedAt && ` · since ${formatDate(a.seasonStartedAt)}`}
      </p>

      <div className="cf-hero">
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
          </p>
        </div>
        <div className={`cf-hero-card net ${up ? "up" : "down"}`}>
          <p className="cf-hero-label">{up ? "Profit so far" : "Loss to recover"}</p>
          <p className="cf-hero-value num">
            {up ? "▲" : "▼"} {formatMoney(Math.abs(a.season.result))}
          </p>
          <p className="cf-hero-sub">Received − paid · final when the season closes</p>
        </div>
      </div>

      <div className="stat-grid" style={{ margin: "16px 0" }}>
        <div className="stat-card">
          <p className="stat-label">Own grain in hand</p>
          <p className="stat-value tone-primary">
            {a.ownKg} {unit}
          </p>
          {a.lentOut > 0 && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
              incl. {a.lentOut} {unit} lent out
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">Break-even rate</p>
          {a.breakEvenRate !== null ? (
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
        {a.stockUdhaar > 0 && (
          <div className="stat-card">
            <p className="stat-label">Stock Udhaar (not bought yet)</p>
            <p className="stat-value tone-consigned">
              {a.stockUdhaar} {unit}
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
                    ? `Final ${a.season.result >= 0 ? "profit" : "loss"}: ${formatMoney(Math.abs(a.season.result))}`
                    : "Finish the steps above to close the season."}
              </p>
              <CloseSeasonButton
                productId={a.product.id}
                productName={a.product.name}
                seasonNumber={a.seasonNumber}
                result={a.season.result}
                disabled={!ready || nothingYet}
              />
            </div>
          </section>
        );
      })()}

      <section className="panel cf-panel">
        <h3 className="cf-panel-title">Day by day</h3>
        {a.days.length === 0 ? (
          <p className="cf-empty">Nothing bought or sold yet this season.</p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Received</th>
                <th style={{ textAlign: "right" }}>That day</th>
                <th style={{ textAlign: "right" }}>Result after</th>
              </tr>
            </thead>
            <tbody>
              {a.days.map((d) => (
                <tr key={d.date}>
                  <td>{formatDate(d.date)}</td>
                  <td className="num" style={{ textAlign: "right", color: "var(--consigned-600)" }}>
                    {d.paid ? `− ${formatMoney(d.paid)}` : "—"}
                  </td>
                  <td className="num" style={{ textAlign: "right", color: "var(--primary-600)" }}>
                    {d.received ? `+ ${formatMoney(d.received)}` : "—"}
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
