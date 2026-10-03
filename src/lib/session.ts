import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Self-rolled session: a signed, httpOnly JWT in a cookie, carrying
// only userId — never shopId (which shop a user acts as is resolved
// fresh from UserShop on every request, via getCurrentShopId(), so
// revoking/reassigning shop access takes effect immediately without
// needing the user to log in again).
const COOKIE_NAME = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set — see .env.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Returns the session's userId, or null if there's no cookie or it
// fails verification (expired, tampered, wrong secret) — callers
// treat null as "not logged in," never throw for this specific case,
// since an expired/missing session is an expected, routine state
// (every visitor hits this before logging in), not an error condition.
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

// Edge-safe variant for middleware — same verification, but takes the
// raw cookie value directly instead of calling next/headers' cookies()
// (middleware reads from the NextRequest it's given, not that API).
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
