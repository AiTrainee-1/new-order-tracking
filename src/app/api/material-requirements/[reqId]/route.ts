import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

export async function PATCH(request: Request, context: RouteContext<"/api/material-requirements/[reqId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { reqId } = await context.params;
  const existing = await prisma.materialRequirement.findUnique({ where: { id: reqId } });
  if (!existing) return apiError(404, "Requirement not found.");
  if (!(await canEnterMaterials(auth.session.userId, existing.orderId, existing.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  const data: Record<string, unknown> = { updatedBy: auth.session.userId };
  for (const key of ["category", "name", "requiredQty", "unit", "supplier", "sortOrder", "isCompleted", "notes"] as const) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  const updated = await prisma.materialRequirement.update({ where: { id: reqId }, data });
  return NextResponse.json({ requirement: serializeForJson(updated) });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/material-requirements/[reqId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const { reqId } = await context.params;
  const existing = await prisma.materialRequirement.findUnique({ where: { id: reqId } });
  if (!existing) return apiError(404, "Requirement not found.");
  if (!(await canEnterMaterials(auth.session.userId, existing.orderId, existing.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  await prisma.materialRequirement.delete({ where: { id: reqId } });
  return NextResponse.json({ ok: true });
}
