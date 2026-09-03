import { IBM_Plex_Sans } from "next/font/google";
import { SidebarNav } from "./SidebarNav";
import "./dashboard.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

// Shared shell for every shopkeeper-facing screen (Dashboard, Products,
// Customers, ...). Each module page renders inside <main> — the
// sidebar itself carries no module logic.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${plexSans.variable} shop-app`}>
      <aside className="sidebar">
        <div className="shop-id">
          <div className="mark">S</div>
          <p>Shoaib Traders</p>
        </div>

        <SidebarNav />

        <div className="sidebar-footer">
          <div className="avatar">SH</div>
          <p>Shoaib · Owner</p>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
