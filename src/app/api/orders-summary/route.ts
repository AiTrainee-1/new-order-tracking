import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin, isAdminOrMd } from "@/lib/server/authz";
import { buildOrderSummaries } from "@/lib/server/orderSummaries";

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
  return NextResponse.json({ summaries: await buildOrderSummaries({ includeHidden }) });
}
