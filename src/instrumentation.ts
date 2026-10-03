// Runs once when the server starts (Next.js instrumentation hook) —
// validates required env vars immediately so a missing/malformed
// value fails loudly at boot, not partway through a request. Only
// relevant to the Node runtime (the actual server process); the Edge
// runtime (middleware) never calls this.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }
}
