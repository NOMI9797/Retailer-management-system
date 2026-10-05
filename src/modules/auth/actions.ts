"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession, getSessionUserId } from "@/lib/session";
import { signupSchema, loginSchema, type SignupInput, type LoginInput } from "./schema";

const BCRYPT_ROUNDS = 12;

// Both signup and login RETURN a result object on failure rather than
// throwing — Next.js production builds strip a thrown Error's message
// before it reaches the client (replaced with a generic "Server
// Components render" digest box, regardless of how cleanly the
// client's own try/catch is written), so a thrown "Incorrect email or
// password" or "account already exists" would silently become
// unreadable in production/staging while looking completely fine in
// local dev. A returned value has no such restriction — the real
// message always reaches the form. See each caller (LoginForm,
// SignupForm) for the client-side handling of this shape.
export type AuthResult =
  | { success: true; user: { id: string; name: string; email: string } }
  | { success: false; error: string };

// Auto-links every new signup to the shop, so login works immediately
// with no manual Prisma Studio step — per explicit "keep it simple for
// now" decision. The UserShop/multi-tenant machinery (manual
// assignment, per-user shop isolation) is left fully in place and
// unmodified, just not gating signup right now: swap this single
// auto-link line out for an explicit admin-assignment step later
// without touching anything else (schema, getCurrentShopId,
// middleware, the dashboard layout's fallback) to re-enable it.
export async function signup(input: SignupInput): Promise<AuthResult> {
  const data = signupSchema.parse(input);

  const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) {
    return { success: false, error: "An account with this email already exists" };
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const user = await db.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
    },
  });

  // The first existing shop, or a fresh one if truly none exists yet
  // — keeps this self-contained even on an empty database, without
  // needing a separate "create shop" flow to exist first.
  let shop = await db.shop.findFirst();
  if (!shop) {
    shop = await db.shop.create({ data: { name: `${data.name}'s Shop` } });
  }
  await db.userShop.create({ data: { userId: user.id, shopId: shop.id, role: "OWNER" } });

  await createSession(user.id);
  return { success: true, user: { id: user.id, name: user.name, email: user.email } };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const data = loginSchema.parse(input);

  const user = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  // Same generic message whether the email doesn't exist or the
  // password is wrong — never reveal which one, so a login attempt
  // can't be used to enumerate registered emails.
  const invalidMessage = "Incorrect email or password";
  if (!user || !user.isActive) {
    return { success: false, error: invalidMessage };
  }

  const passwordMatches = await bcrypt.compare(data.password, user.passwordHash);
  if (!passwordMatches) {
    return { success: false, error: invalidMessage };
  }

  await createSession(user.id);
  return { success: true, user: { id: user.id, name: user.name, email: user.email } };
}

export async function logout() {
  await destroySession();
}

// The logged-in user's own identity (name/email), for display in the
// sidebar — not scoped to a shop, since a user can exist with no shop
// access yet. Returns null when there's no valid session, same
// "null means not logged in, never throw" convention getSessionUserId
// itself follows.
export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;

  return { id: user.id, name: user.name, email: user.email };
}
