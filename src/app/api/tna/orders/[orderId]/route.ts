import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canViewOrder, isAdmin } from "@/lib/server/authz";
import { getOrderTna, saveOrderTna, TnaInputError, type TnaStageInput } from "@/lib/server/tna";

/** One order's TNA schedules, with live actuals and the full history. Anyone who
 *  can see the order may read it (it's what the order's workflow shows). */
export async function GET(_request: NextRequest, context: RouteContext<"/api/tna/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { orderId } = await context.params;
  if (!(await canViewOrder(auth.session.userId, orderId))) return apiError(404, "Order not found.");

  return NextResponse.json(await getOrderTna(orderId));
}

/**
 * Assign / change / clear the TNA of an order's stages, all in one transaction.
 * Body: { stages: [{ sectionId, plannedStart, plannedEnd, graceMinutes?, notes? }] }
 * A stage sent with no start and no end has its schedule cleared. Admin only.
 */
export async function PUT(request: NextRequest, context: RouteContext<"/api/tna/orders/[orderId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) return apiError(403, "Only Admin accounts can assign TNA.");
  const { orderId } = await context.params;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.stages)) return apiError(400, "stages must be a list.");
  if (body.stages.length > 100) return apiError(400, "Too many stages in one save.");
  const stages: TnaStageInput[] = body.stages.map((s: Record<string, unknown>) => ({
    sectionId: typeof s?.sectionId === "string" ? s.sectionId : "",
    plannedStart: typeof s?.plannedStart === "string" && s.plannedStart ? s.plannedStart : null,
    plannedEnd: typeof s?.plannedEnd === "string" && s.plannedEnd ? s.plannedEnd : null,
    graceMinutes: typeof s?.graceMinutes === "number" ? s.graceMinutes : 0,
    notes: typeof s?.notes === "string" ? s.notes : null,
  }));
  if (stages.some((s) => !s.sectionId)) return apiError(400, "Every stage needs a sectionId.");

  try {
    await saveOrderTna(orderId, stages, auth.session.userId);
  } catch (err) {
    if (err instanceof TnaInputError) return apiError(400, err.message);
    console.error("[tna] save failed", err);
    return apiError(500, "Couldn't save the TNA, so nothing was changed. Please try again.");
  }
  return NextResponse.json(await getOrderTna(orderId));
}
