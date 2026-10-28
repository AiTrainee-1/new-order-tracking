import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canSeeAllOrders, visibleOrderWhere } from "@/lib/server/authz";
import { computeGroupTotals } from "@/lib/server/groupTotals";

/**
 * The group-level view: each member order's own figures per stage, and their
 * sum, worked out now from the group's current links (see lib/groupTotals.ts).
 * Read-only. Anyone who sees every order (Admin, MD, Job Work) may read any group;
 * anyone else only a group that has an order they can already see.
 */
export async function GET(_request: Request, context: RouteContext<"/api/order-groups/[groupId]/totals">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { groupId } = await context.params;

  // One question for the whole group, rather than three queries per member order asked one after another.
  if (!(await canSeeAllOrders(auth.session.userId))) {
    const visible = await prisma.order.count({ where: { groupLinks: { some: { groupId } }, ...visibleOrderWhere(auth.session.userId) } });
    if (visible === 0) return apiError(404, "Group not found.");
  }

  const totals = await computeGroupTotals(groupId);
  if (!totals) return apiError(404, "Group not found.");
  return NextResponse.json({ totals });
}
