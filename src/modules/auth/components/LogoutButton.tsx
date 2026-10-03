"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "../actions";

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" className="sidebar-logout" onClick={handleLogout} disabled={isLoggingOut}>
      {isLoggingOut ? "Logging out…" : "Log out"}
    </button>
  );
}
