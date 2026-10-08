import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canViewOrder, isAdminOrMd } from "@/lib/server/authz";
import { computeGroupTotals } from "@/lib/server/groupTotals";

/**
 * The group-level view: each member order's own figures per stage, and their
 * sum, worked out now from the group's current links (see lib/groupTotals.ts).
 * Read-only. Admin and MD may read any group; anyone else only a group that has
 * an order they can already see.
 */
export async function GET(_request: Request, context: RouteContext<"/api/order-groups/[groupId]/totals">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { groupId } = await context.params;

  if (!(await isAdminOrMd(auth.session.userId))) {
    const links = await prisma.orderGroupLink.findMany({ where: { groupId }, select: { orderId: true }, distinct: ["orderId"] });
    let allowed = false;
    for (const l of links) {
      if (await canViewOrder(auth.session.userId, l.orderId)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) return apiError(404, "Group not found.");
  }

  const totals = await computeGroupTotals(groupId);
  if (!totals) return apiError(404, "Group not found.");
  return NextResponse.json({ totals });
}
