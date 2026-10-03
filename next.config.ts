import type { NextConfig } from "next";

// Dev-only build indicator defaults to bottom-left, which sits right
// on top of the dashboard sidebar's own bottom-left footer (shop name,
// user name, logout button) — moved to bottom-right so it never
// overlaps real UI.
const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
