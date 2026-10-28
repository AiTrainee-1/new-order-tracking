import "server-only";
import { NextResponse } from "next/server";
import { deleteSession, getSession, type SessionPayload } from "./session";
import { isSessionCurrent } from "./authz";
import { badDateMessage, isSaneDate } from "../dateInput";

/** Common JSON error shape every Route Handler returns on failure. */
export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * A 400 when any date the client sent is not a real day in a sane range (lib/dateInput.ts), else null.
 * A blank or missing value is skipped - pass only the dates the request may carry; a REQUIRED date should
 * be checked with isSaneDate itself, since blank is not acceptable there.
 */
export function badDateError(...dates: [label: string, value: unknown][]): NextResponse | null {
  for (const [label, value] of dates) {
    if (value === undefined || value === null || value === "") continue;
    if (!isSaneDate(value)) return apiError(400, badDateMessage(value, label));
  }
  return null;
}

/** Require an authenticated session or return a 401 - the first line every
 *  protected Route Handler calls before touching data. A token for a
 *  deactivated account, or one issued before a password reset, is refused
 *  and its cookie cleared, so proxy.ts lets the browser back to /login. */
export async function requireApiSession(): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: apiError(401, "Not authenticated.") };
  }
  if (!(await isSessionCurrent(session))) {
    await deleteSession();
    return { error: apiError(401, "Your session has ended. Please sign in again.") };
  }
  return { session };
}

/** The Prisma error code (P2002 unique clash, P2003 foreign-key restrict, P2025 not found, ...) of a thrown error, if it has one. */
export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return undefined;
}
