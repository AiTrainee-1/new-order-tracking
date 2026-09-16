import "server-only";
import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "./session";

/** Common JSON error shape every Route Handler returns on failure. */
export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Require an authenticated session or return a 401 - the first line every
 *  protected Route Handler calls before touching data. */
export async function requireApiSession(): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: apiError(401, "Not authenticated.") };
  }
  return { session };
}
