import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const requirementId = typeof body?.requirementId === "string" ? body.requirementId : "";
  if (!requirementId) return apiError(400, "requirementId is required.");

  const requirement = await prisma.materialRequirement.findUnique({ where: { id: requirementId } });
  if (!requirement) return apiError(404, "Requirement not found.");
  if (!(await canEnterMaterials(auth.session.userId, requirement.orderId, requirement.poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const entry = await prisma.materialEntry.create({
    data: {
      requirementId,
      entryType: body.entryType,
      qty: body.qty,
      entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
      supplier: body.supplier ?? null,
      docNo: body.docNo ?? null,
      docDate: body.docDate ? new Date(body.docDate) : null,
      lotRef: body.lotRef ?? null,
      notes: body.notes ?? null,
      enteredBy: auth.session.userId,
    },
  });

  return NextResponse.json({ entry: serializeForJson(entry) }, { status: 201 });
}
