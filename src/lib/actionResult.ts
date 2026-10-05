// Shared result shape for every Server Action that can fail with a
// user-facing validation/business-rule message — e.g. "Not enough
// stock", "Customer not found", "Amount exceeds balance".
//
// Next.js strips the .message off any Error thrown directly from a
// "use server" function before it reaches the client in production
// builds (confirmed via live testing against this app's deployed
// staging environment — not a config toggle, intentional Next.js
// behavior). The client only ever sees a generic, unreadable
// "An error occurred in the Server Components render..." box instead
// of the real message, even though the exact same code shows the
// real message correctly in local dev. A RETURNED value has no such
// restriction, so every action that used to throw for an expected,
// user-facing failure now returns ActionResult<T> instead.
//
// Actions that only ever fail for a genuine invariant (a lookup that
// should never fail in correct operation, never triggered directly by
// a user's form submission) are deliberately left throwing — see each
// such throw site's own comment for why.
export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail<T = never>(error: string): ActionResult<T> {
  return { success: false, error };
}
