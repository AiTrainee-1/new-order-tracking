import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
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
/**
 * Assignments with their order (+ buyer), PO, stage row and user. These used to be an `include` - which Prisma
 * runs as one query after another, a database round trip apiece - and a floor user's "My Work" waits for this.
 * The four lookups are independent (found by the same filter, not by waiting for the assignments), so they go out
 * together.
 */
async function loadAssignments(where: Prisma.UserAssignmentWhereInput) {
  const [rows, orders, buyers, pos, sections, users] = await Promise.all([
    prisma.userAssignment.findMany({ where, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({ where: { userAssignments: { some: where } } }),
    prisma.buyer.findMany({ select: { id: true, name: true } }),
    prisma.purchaseOrder.findMany({ where: { userAssignments: { some: where } } }),
    prisma.orderStagePlan.findMany({ where: { userAssignments: { some: where } } }),
    prisma.appUser.findMany({ where: { userAssignments: { some: where } }, select: { id: true, name: true, username: true, phone: true } }),
  ]);
  const buyerById = new Map(buyers.map((b) => [b.id, b]));
  const orderById = new Map(orders.map((o) => [o.id, { ...o, buyer: o.buyerId ? (buyerById.get(o.buyerId) ?? null) : null }]));
  const poById = new Map(pos.map((p) => [p.id, p]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const userById = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...r,
    order: orderById.get(r.orderId)!,
    po: r.poId ? (poById.get(r.poId) ?? null) : null,
    section: sectionById.get(r.sectionId)!,
    user: userById.get(r.userId)!,
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  // `userId=me` means the signed-in user - so a page can ask for its own assignments without first waiting for
  // /api/auth/me to tell it its id.
  const rawUserId = request.nextUrl.searchParams.get("userId") ?? undefined;
  const userId = rawUserId === "me" ? auth.session.userId : rawUserId;
  const orderId = request.nextUrl.searchParams.get("orderId") ?? undefined;

  // Anyone can look up their OWN assignments (this is how a floor user's "My
  // Work" list is built). Looking up one order's roster (who's assigned to
  // which section - used by OrderDetailPage's "next stage assignees") needs
  // only ordinary view access to that order. The full, unscoped roster is
  // read-only territory for MD too (MdUsersPage's directory view), same as
  // /api/users; anything else requires Admin.
  const isSelfLookup = !!userId && userId === auth.session.userId;
  // The permission check and the data are independent - asked together; a refusal just drops the rows.
  const checkAllowed = async () => isSelfLookup || (!!orderId && (await canViewOrder(auth.session.userId, orderId))) || (await isAdminOrMd(auth.session.userId));
  const [allowed, assignments] = await Promise.all([checkAllowed(), loadAssignments({ ...(userId ? { userId } : {}), ...(orderId ? { orderId } : {}) })]);
  if (!allowed) return apiError(403, "Only Admin accounts can view other users' assignments.");

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
