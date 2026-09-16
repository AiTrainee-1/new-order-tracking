import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canViewOrder } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const orderId = request.nextUrl.searchParams.get("orderId");
  const entityId = request.nextUrl.searchParams.get("entityId") ?? undefined;
  if (!orderId) return apiError(400, "orderId is required.");
  if (!(await canViewOrder(auth.session.userId, orderId))) {
    return apiError(403, "You don't have access to this order.");
  }

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

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  try {
    await prisma.auditLog.create({
      data: {
        orderId: body.orderId ?? null,
        poId: body.poId ?? null,
        sectionId: body.sectionId ?? null,
        entity: body.entity,
        entityId: body.entityId,
        action: body.action,
        summary: body.summary,
        changes: body.changes ?? undefined,
        notes: body.notes ?? null,
        userId: auth.session.userId,
      },
    });
  } catch (error) {
    console.warn("Audit log write failed:", error);
  }

  return NextResponse.json({ ok: true });
}
