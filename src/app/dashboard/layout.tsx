import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { SidebarNav } from "./SidebarNav";
import { ToastHost } from "@/components/shared/ToastHost";
import { getCurrentUser } from "@/modules/auth/actions";
import { getCurrentShopName } from "@/lib/tenant";
import { LogoutButton } from "@/modules/auth/components/LogoutButton";
import "./dashboard.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

// Only used for Settings' account-type code tags (REGULAR, LOAN, ...)
// — a monospace face makes short uppercase codes read as "codes"
// rather than regular text.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-plex-mono",
});

// Shared shell for every shopkeeper-facing screen (Dashboard, Products,
// Customers, ...). Each module page renders inside <main> — the
// sidebar itself carries no module logic. Middleware already
// guarantees a valid session reaches here, but a freshly signed-up
// user may have no UserShop assignment yet (see getCurrentShopName) —
// that renders a dedicated "waiting for access" screen instead of
// letting every module page's own getCurrentShopId() call throw.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, shopName] = await Promise.all([getCurrentUser(), getCurrentShopName()]);

  const initials = user
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  if (!shopName) {
    return (
      <div className={`${plexSans.variable} shop-app`}>
        <div className="no-shop-access">
          <div className="mark">S</div>
          <h1>Waiting for shop access</h1>
          <p>
            Your account{user ? ` (${user.email})` : ""} hasn&apos;t been assigned to a shop yet. Contact the
            shop owner to get access.
          </p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  return (
    <div className={`${plexSans.variable} ${plexMono.variable} shop-app`}>
      <aside className="sidebar">
        <div className="shop-id">
          <div className="mark">S</div>
          <p>{shopName}</p>
        </div>

        <SidebarNav />

        <div className="sidebar-footer">
          <div className="sidebar-footer-identity">
            <div className="avatar">{initials}</div>
            <p>{user?.name}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="main">{children}</main>

      <ToastHost />
    </div>
  );
}
