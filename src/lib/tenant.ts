import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

// Every Server Action calls this to get the current shop's id, so
// scoping by shopId is never left to individual feature code to
// remember. Resolves the logged-in user's shop via UserShop — the
// only place a user is ever linked to a shop, assigned by hand in
// Prisma Studio (see UserShop's schema comment). A user with no
// UserShop row yet (freshly signed up, not assigned) gets a clear,
// specific error rather than silently falling back to any default
// shop — there is no such thing as a default shop once auth is real.
// Middleware already guarantees a valid session reaches here for
// every /dashboard request, so "not logged in" is not a case this
// needs to handle gracefully — it throws too, same as the "not
// assigned" case, just with a different message.
export async function getCurrentShopId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new Error("Not signed in.");
  }

  const userShop = await db.userShop.findFirst({ where: { userId } });
  if (!userShop) {
    throw new Error("Your account hasn't been assigned to a shop yet. Contact the shop owner.");
  }

  return userShop.shopId;
}

// For display only (sidebar shop name) — unlike getCurrentShopId,
// returns null instead of throwing when there's no session or no
// shop assignment yet, since the dashboard layout needs to render a
// "waiting for access" state rather than crash for a freshly signed-up
// user with no UserShop row.
export async function getCurrentShopName(): Promise<string | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const userShop = await db.userShop.findFirst({ where: { userId }, include: { shop: true } });
  return userShop?.shop.name ?? null;
}
