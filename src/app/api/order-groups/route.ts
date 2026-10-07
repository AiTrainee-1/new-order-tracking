import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { defaultGroupName, GroupInputError, loadGroupViews, validateGroupInput } from "@/lib/server/orderGroupAdmin";

/** Every group - read by any signed-in user, because the stage views and the
 *  data-entry banner need to show which orders share a stage. It carries only
 *  names, IO numbers, styles and colours. */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ groups: await loadGroupViews() });
}

/** Creating a group is admin-only. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) return apiError(403, "Only an admin can create order groups.");

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  try {
    const valid = await validateGroupInput(body);
    const name = (typeof body.name === "string" ? body.name.trim() : "").slice(0, 100) || defaultGroupName(valid);

    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.orderGroup.create({ data: { name, ioNo: valid.ioNo, createdBy: auth.session.userId } });
      await tx.orderGroupLink.createMany({
        data: valid.orders.flatMap((o) => valid.stages.map((s) => ({ groupId: created.id, orderId: o.id, stageKey: s.key }))),
      });
      await tx.auditLog.createMany({
        data: valid.orders.map((o) => ({
          orderId: o.id,
          entity: "order_group",
          entityId: created.id,
          action: "create" as const,
          summary: `Added to group "${name}" with ${valid.orders.length - 1} other order${valid.orders.length === 2 ? "" : "s"} for ${valid.stages.map((s) => s.label).join(", ")}`,
          userId: auth.session.userId,
        })),
      });
      return created;
    });

    const [view] = await loadGroupViews(group.id);
    return NextResponse.json({ group: view }, { status: 201 });
  } catch (error) {
    if (error instanceof GroupInputError) return apiError(error.status, error.message);
    // The (order, stage) unique key is the last line of defence against two
    // admins grouping the same order's stage at the same moment.
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") {
      return apiError(409, "One of those orders is already grouped for one of those stages.");
    }
    throw error;
  }
}
