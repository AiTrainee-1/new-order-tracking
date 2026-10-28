import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canViewOrder, canWriteToOrder, sectionsBelongToOrders } from "@/lib/server/authz";
import { auditCreate, parseBody } from "@/lib/server/validation";
import { serializeForJson } from "@/lib/server/serialize";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const orderId = request.nextUrl.searchParams.get("orderId");
  const entityId = request.nextUrl.searchParams.get("entityId") ?? undefined;
  if (!orderId) return apiError(400, "orderId is required.");
  if (!(await canViewOrder(auth.session.userId, orderId))) return apiError(403, "You don't have access to this order.");
  const rows = await prisma.auditLog.findMany({
    where: { orderId, ...(entityId ? { entityId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ auditLog: serializeForJson(rows) });
}

/**
 * Audit failures are swallowed deliberately (matching the old app): losing
 * the history of a saved quantity is bad, but rolling back a floor
 * operator's genuine production entry because the log write failed is
 * worse. Callers should not surface this route's errors to the user.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(auditCreate, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // The row is always written as the caller (userId comes from the session), and only by someone who can
  // change this order at all - and its PO/stage, when named, must be this order's.
  const [canWrite, shapeOk] = await Promise.all([
    canWriteToOrder(auth.session.userId, body.orderId),
    body.sectionId
      ? sectionsBelongToOrders([{ orderId: body.orderId, poId: body.poId, sectionId: body.sectionId }])
      : body.poId
        ? prisma.purchaseOrder.count({ where: { id: body.poId, orderId: body.orderId } }).then((n) => n > 0)
        : true,
  ]);
  if (!canWrite) return apiError(403, "You don't have write access to this order.");
  if (!shapeOk) return apiError(400, "That PO or stage belongs to a different order.");

  try {
    await prisma.auditLog.create({
      data: {
        orderId: body.orderId,
        poId: body.poId,
        sectionId: body.sectionId,
        entity: body.entity,
        entityId: body.entityId,
        action: body.action,
        summary: body.summary,
        changes: (body.changes ?? undefined) as Prisma.InputJsonValue | undefined,
        notes: body.notes,
        userId: auth.session.userId,
      },
    });
  } catch (error) {
    console.warn("Audit log write failed:", error);
  }

  return NextResponse.json({ ok: true });
}
