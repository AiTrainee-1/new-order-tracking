import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { fetchActivityRecords } from "@/lib/server/trackingActivity";
import type { ActivityResponse } from "@/lib/trackingHistory";

/** The upper bound on how wide a range this endpoint will scan - generous
 *  for a shop-floor tracking app's real volume, but still a real limit so a
 *  mistyped range can't try to pull the entire table's history at once. */
const MAX_RANGE_DAYS = 400;

/**
 * Admin-only. The flat, per-entry activity feed behind the User-Wise Report,
 * Today vs Yesterday, Stage/Order-Wise Reports and the Detailed Activity
 * Report - every one of those is just a different grouping of this same
 * list (see src/lib/trackingActivity.ts), built from the real data-entry
 * tables (see src/lib/server/trackingActivity.ts's module comment).
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) return apiError(403, "Only Admin accounts can view Tracking History.");

  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (!from || !to || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return apiError(400, "Pick a valid date range.");
  }
  if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    return apiError(400, `That range is too wide - pick ${MAX_RANGE_DAYS} days or fewer.`);
  }

  const records = await fetchActivityRecords({ from: fromDate, to: toDate });
  const result: ActivityResponse = { from, to, records };
  return NextResponse.json(result);
}
