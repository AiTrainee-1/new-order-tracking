import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

export async function GET(_request: Request, context: RouteContext<"/api/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      image: { select: { id: true, contentType: true } },
      purchaseOrders: { include: { sizeQuantities: { orderBy: { sortOrder: "asc" } } } },
      stagePlan: { orderBy: { seq: "asc" } },
    },
  });

  if (!order) return apiError(404, "Order not found.");

  if (order.isHidden) {
    const allowed = order.createdBy === auth.session.userId || (await isAdmin(auth.session.userId));
    if (!allowed) return apiError(404, "Order not found.");
  }

  return NextResponse.json({ order: serializeForJson(order) });
}

/** Only Admin, or the floor user who created the order, may hide/unhide or
 *  delete it - "create, and manage what you created, not what it's used for
 *  afterward" (see CreateOrderPage's module comment). */
async function canManage(userId: string, order: { createdBy: string | null }): Promise<boolean> {
  if (order.createdBy === userId) return true;
  return isAdmin(userId);
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;
  const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { createdBy: true } });
  if (!existing) return apiError(404, "Order not found.");
  if (!(await canManage(auth.session.userId, existing))) {
    return apiError(403, "You don't have permission to change this order.");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.isHidden !== "boolean") return apiError(400, "isHidden (boolean) is required.");

  const updated = await prisma.order.update({ where: { id: orderId }, data: { isHidden: body.isHidden } });
  return NextResponse.json({ order: serializeForJson(updated) });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;
  const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { createdBy: true } });
  if (!existing) return apiError(404, "Order not found.");
  if (!(await canManage(auth.session.userId, existing))) {
    return apiError(403, "You don't have permission to delete this order.");
  }

  await prisma.order.delete({ where: { id: orderId } });
  return NextResponse.json({ ok: true });
}
