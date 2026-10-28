import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin, isAdminOrMd } from "@/lib/server/authz";
import { buildOrderSummaries } from "@/lib/server/orderSummaries";
import type { OrderSummary } from "@/lib/orderSummary";

/**
 * The summaries read every order's production rows, and the Orders, Output and MD pages (plus the sidebar on
 * each) can ask at the same moment. Requests that arrive while one build is running share its result instead
 * of starting another full read; nothing is kept once it finishes, so a fresh request always sees fresh data.
 */
const inFlight = new Map<boolean, Promise<OrderSummary[]>>();

function sharedOrderSummaries(includeHidden: boolean): Promise<OrderSummary[]> {
  const running = inFlight.get(includeHidden);
  if (running) return running;
  const build = buildOrderSummaries({ includeHidden }).finally(() => inFlight.delete(includeHidden));
  inFlight.set(includeHidden, build);
  return build;
}

/**
 * Every order's production position (quantities, rejection, rework, stage
 * progress, last activity) - the figures on the Orders, Output and MD cards.
 * Admin and MD only: it shows every order's quantities. Hidden orders are
 * included only for an admin who asks for them.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdminOrMd(auth.session.userId))) return apiError(403, "Only an admin or MD can see this.");

  const wantsHidden = request.nextUrl.searchParams.get("includeHidden") === "true";
  const includeHidden = wantsHidden && (await isAdmin(auth.session.userId));
  return NextResponse.json({ summaries: await sharedOrderSummaries(includeHidden) });
}
