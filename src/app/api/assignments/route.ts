import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin, isAdminOrMd, canViewOrder } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/**
 * Per-order/PO/section grants (user_assignments) - distinct from the global
 * per-stage defaults in /api/stage-assignments. `section` here is an
 * OrderStagePlan row (this order's own frozen stage row), not the global
 * catalog - it already carries label/unitType/key, so no extra join is
 * needed to display it.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const userId = request.nextUrl.searchParams.get("userId") ?? undefined;
  const orderId = request.nextUrl.searchParams.get("orderId") ?? undefined;

  // Anyone can look up their OWN assignments (this is how a floor user's "My
  // Work" list is built). Looking up one order's roster (who's assigned to
  // which section - used by OrderDetailPage's "next stage assignees") needs
  // only ordinary view access to that order. The full, unscoped roster is
  // read-only territory for MD too (MdUsersPage's directory view), same as
  // /api/users; anything else requires Admin.
  const isSelfLookup = !!userId && userId === auth.session.userId;
  const isOrderLookup = !!orderId && (await canViewOrder(auth.session.userId, orderId));
  if (!isSelfLookup && !isOrderLookup && !(await isAdminOrMd(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can view other users' assignments.");
  }

  const assignments = await prisma.userAssignment.findMany({
    where: { ...(userId ? { userId } : {}), ...(orderId ? { orderId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      order: { include: { buyer: { select: { id: true, name: true } } } },
      po: true,
      section: true,
      user: { select: { id: true, name: true, username: true, phone: true } },
    },
  });

  return NextResponse.json({ assignments: serializeForJson(assignments) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can create assignments.");
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const sectionId = typeof body?.sectionId === "string" ? body.sectionId : "";
  const poId = typeof body?.poId === "string" ? body.poId : null;
  const unitName = typeof body?.unitName === "string" && body.unitName.trim() ? body.unitName.trim() : null;
  const canEnterData = body?.canEnterData !== false;

  if (!userId || !orderId || !sectionId) {
    return apiError(400, "userId, orderId and sectionId are required.");
  }

  const assignment = await prisma.userAssignment.create({
    data: { userId, orderId, sectionId, poId, unitName, canEnterData },
  });

  return NextResponse.json({ assignment: serializeForJson(assignment) }, { status: 201 });
}
