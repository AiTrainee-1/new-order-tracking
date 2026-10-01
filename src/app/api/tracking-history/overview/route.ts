import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { fetchActivityRecords } from "@/lib/server/trackingActivity";
import type { TrackingOverview } from "@/lib/trackingHistory";

function parseInstant(params: URLSearchParams, key: string): Date {
  const d = new Date(params.get(key) ?? "");
  if (Number.isNaN(d.getTime())) throw new Error(`Missing or invalid "${key}".`);
  return d;
}

/**
 * Admin-only. The always-on Report Dashboard numbers at the top of Tracking
 * History - independent of whatever date range the report tabs below are
 * currently filtered to, so "Today's Entries" always means literal today.
 * `today*`/`yesterday*` are ISO instants the client already resolved (see
 * resolveRange("today"|"yesterday", ...) in lib/trackingHistory.ts), so this
 * route never has to guess the caller's timezone.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) return apiError(403, "Only Admin accounts can view Tracking History.");

  const params = request.nextUrl.searchParams;
  let todayFrom: Date, todayTo: Date, yesterdayFrom: Date, yesterdayTo: Date;
  try {
    todayFrom = parseInstant(params, "todayFrom");
    todayTo = parseInstant(params, "todayTo");
    yesterdayFrom = parseInstant(params, "yesterdayFrom");
    yesterdayTo = parseInstant(params, "yesterdayTo");
  } catch (e) {
    return apiError(400, e instanceof Error ? e.message : "Invalid date range.");
  }

  const visible = { order: { isHidden: false } };
  const [today, yesterday, totalOrders, totalStages, completedGroups] = await Promise.all([
    fetchActivityRecords({ from: todayFrom, to: todayTo }),
    fetchActivityRecords({ from: yesterdayFrom, to: yesterdayTo }),
    prisma.order.count({ where: { isHidden: false } }),
    prisma.orderStagePlan.count({ where: visible }),
    prisma.stageEntry.groupBy({ by: ["sectionId"], where: { ...visible, isCompleted: true } }),
  ]);

  const completedStages = completedGroups.length;
  const result: TrackingOverview = {
    totalOrders,
    completedStages,
    pendingStages: Math.max(totalStages - completedStages, 0),
    totalStages,
    todayEntries: today.length,
    yesterdayEntries: yesterday.length,
    activeUsersToday: new Set(today.map((r) => r.userId)).size,
  };
  return NextResponse.json(result);
}
