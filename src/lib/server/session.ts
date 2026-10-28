import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionPayload {
  userId: string;
  role: string;
  /** Fingerprint of the password hash at sign-in (see passwordVersion) - a password reset changes it, ending every older session. */
  pwv?: string;
  [key: string]: unknown;
}

/**
 * A short, non-reversible fingerprint of a bcrypt hash. Stored in the token so a session can be checked against the
 * user's current password without a sessions table: once the password changes, old tokens no longer match.
 * Web Crypto, so it also runs wherever proxy.ts does.
 */
export async function passwordVersion(passwordHash: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwordHash));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

async function encrypt(payload: SessionPayload, expiresAt: Date) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());
}

async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Sign the user in: sets the httpOnly session cookie on the response. */
export async function createSession(userId: string, role: string, passwordHash: string) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encrypt({ userId, role, pwv: await passwordVersion(passwordHash) }, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Read and verify the current session from the request cookie, if any. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decrypt(token);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Verify a raw cookie value without needing next/headers - used by proxy.ts. */
export async function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  return decrypt(token);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
