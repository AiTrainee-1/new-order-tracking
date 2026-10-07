import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { defaultGroupName, GroupInputError, loadGroupViews, validateGroupInput } from "@/lib/server/orderGroupAdmin";

/** Change a group's name, orders or stages. Admin-only. Entries already saved
 *  are never touched: the change only decides which orders and stages the NEXT
 *  entries are mirrored to. */
export async function PATCH(request: Request, context: RouteContext<"/api/order-groups/[groupId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) return apiError(403, "Only an admin can change order groups.");

  const { groupId } = await context.params;
  const existing = await prisma.orderGroup.findUnique({ where: { id: groupId } });
  if (!existing) return apiError(404, "Group not found.");

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  try {
    const valid = await validateGroupInput(body, groupId);
    const name = (typeof body.name === "string" ? body.name.trim() : "").slice(0, 100) || defaultGroupName(valid);

    await prisma.$transaction(async (tx) => {
      await tx.orderGroup.update({ where: { id: groupId }, data: { name, ioNo: valid.ioNo } });
      await tx.orderGroupLink.deleteMany({ where: { groupId } });
      await tx.orderGroupLink.createMany({
        data: valid.orders.flatMap((o) => valid.stages.map((s) => ({ groupId, orderId: o.id, stageKey: s.key }))),
      });
      await tx.auditLog.createMany({
        data: valid.orders.map((o) => ({
          orderId: o.id,
          entity: "order_group",
          entityId: groupId,
          action: "update" as const,
          summary: `Group "${name}" updated - ${valid.orders.length} orders, ${valid.stages.map((s) => s.label).join(", ")}`,
          userId: auth.session.userId,
        })),
      });
    });

    const [view] = await loadGroupViews(groupId);
    return NextResponse.json({ group: view });
  } catch (error) {
    if (error instanceof GroupInputError) return apiError(error.status, error.message);
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") {
      return apiError(409, "One of those orders is already grouped for one of those stages.");
    }
    throw error;
  }
}

/** Dissolve a group. Every entry it ever mirrored stays exactly as saved on
 *  each order - they simply stop being linked, so a later correction to one no
 *  longer reaches the others. Admin-only. */
export async function DELETE(_request: Request, context: RouteContext<"/api/order-groups/[groupId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) return apiError(403, "Only an admin can remove order groups.");

  const { groupId } = await context.params;
  const existing = await prisma.orderGroup.findUnique({ where: { id: groupId }, include: { links: { select: { orderId: true } } } });
  if (!existing) return apiError(404, "Group not found.");

  const orderIds = Array.from(new Set(existing.links.map((l) => l.orderId)));
  await prisma.$transaction([
    prisma.auditLog.createMany({
      data: orderIds.map((orderId) => ({
        orderId,
        entity: "order_group",
        entityId: groupId,
        action: "delete" as const,
        summary: `Group "${existing.name}" dissolved - entries already saved were left as they are`,
        userId: auth.session.userId,
      })),
    }),
    prisma.orderGroup.delete({ where: { id: groupId } }),
  ]);

  return NextResponse.json({ ok: true });
}
