import Link from "next/link";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import "./home.css";

// Public-facing homepage — introduces the shop. Distinct from
// /dashboard, which is the shopkeeper's daily-use screen. No live
// data here on purpose: this route never touches the database.
export const metadata = {
  title: "Shoaib Traders",
};

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

const ledgerRows = [
  {
    chip: "wheat",
    title: "Grain & consignment",
    description:
      "Wheat and channa handled on commission for farmers, tracked batch by batch, alongside stock the shop owns outright on the same shelf.",
    icon: (
      <path d="M12 2v20M8 6l4-4 4 4M8 12l4-4 4 4M8 18l4-4 4 4" />
    ),
  },
  {
    chip: "ledger",
    title: "One ledger per customer",
    description:
      "Loans, consignment balances, and regular buying — one running account per customer, always showing exactly who owes who.",
    icon: (
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z" />
    ),
  },
  {
    chip: "teal",
    title: "Daily retail & cash",
    description:
      "Everyday goods sold alongside grain trading, with every rupee reconciled to what's actually in the cash box at close.",
    icon: (
      <>
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <div className={`${fraunces.variable} ${plexSans.variable} home-root`}>
      <div className="texture" />
      <div className="wrap">
        <header className="topbar">
          <div className="mark">
            <div className="seal">S</div>
            <span className="mark-name">Shoaib Traders</span>
          </div>
          <div className="topbar-phone">
            Call the shop &nbsp;<strong>0302-7054028</strong>
          </div>
        </header>

        <section className="hero">
          <div className="badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 12l6 6L20 6" />
            </svg>
            Commission agent, since one ledger
          </div>
          <h1 className="headline">
            Grain on the scale.
            <br />
            Every account <em>settled true.</em>
          </h1>
          <p className="lede">
            Wheat and channa handled on commission for farmers, everyday
            retail sold alongside it, and one honest ledger connecting both —
            under Shoaib Traders&apos; roof.
          </p>
          <div className="cta-row">
            <Link href="/dashboard" className="btn-primary">
              Open shop dashboard
            </Link>
            <a href="tel:03027054028" className="phone-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
              0302-7054028
            </a>
          </div>
        </section>

        <section className="ledger-section">
          <h2 className="ledger-heading">How the shop runs</h2>
          <p className="ledger-sub">
            Three things happening under one roof, tracked as one system.
          </p>

          {ledgerRows.map((row) => (
            <div className="ledger-row" key={row.title}>
              <div className={`chip ${row.chip}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  {row.icon}
                </svg>
              </div>
              <p className="ledger-title">{row.title}</p>
              <p className="ledger-desc">{row.description}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
