"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
  },
  {
    href: "/dashboard/daily-sales",
    label: "Daily sales",
    icon: (
      <>
        <circle cx="9" cy="21" r="1.4" />
        <circle cx="18" cy="21" r="1.4" />
        <path d="M2.5 3h2.5l2.7 12.5a2 2 0 002 1.6h8.6a2 2 0 002-1.6L21.5 8H6" />
      </>
    ),
  },
  {
    href: "/dashboard/products",
    label: "Products",
    icon: (
      <>
        <path d="M21 8l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8v8l9 5 9-5V8" />
        <path d="M12 13v8" />
      </>
    ),
  },
  {
    href: "/dashboard/customers",
    label: "Customers",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16.5 6.2a3.2 3.2 0 0 1 0 6M20 20a6 6 0 0 0-4.3-8.4" />
      </>
    ),
  },
  {
    href: "/dashboard/cash-flow",
    label: "Cash flow",
    icon: (
      <>
        <rect x="2.5" y="6" width="19" height="13" rx="2" />
        <path d="M2.5 10.5h19M6.5 15h4" />
      </>
    ),
  },
  {
    href: "/dashboard/expenses",
    label: "Expenses",
    icon: (
      <>
        <path d="M6 2.5h9l4.5 4.5V21a1 1 0 01-1 1H6a1 1 0 01-1-1V3.5a1 1 0 011-1z" />
        <path d="M14 2.5V7h4.5M8.5 12h6M8.5 16h6" />
      </>
    ),
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: <path d="M4 21V10M12 21V4M20 21v-7" />,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 13.5a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V19.6a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.11-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H4.4a2 2 0 110-4h.09a1.7 1.7 0 001.55-1.11 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34H10.5a1.7 1.7 0 001-1.55V4.4a2 2 0 114 0v.09a1.7 1.7 0 001 1.55 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V10.5a1.7 1.7 0 001.55 1H19.6a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z" />
      </>
    ),
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="nav-list">
      {navItems.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        return (
          // suppressHydrationWarning: the active class depends on
          // usePathname(), which can briefly disagree with a
          // server-rendered response served from Next's client route
          // cache during fast sibling-route navigation in dev. It
          // self-corrects on the next navigation; this only silences
          // the (harmless) console warning for that one class attr.
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${isActive ? " active" : ""}`}
            suppressHydrationWarning
          >
            <svg className="icon" viewBox="0 0 24 24">
              {item.icon}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
