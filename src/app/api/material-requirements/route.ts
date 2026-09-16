import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterMaterials } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const poId = typeof body?.poId === "string" ? body.poId : null;
  if (!orderId) return apiError(400, "orderId is required.");
  if (!(await canEnterMaterials(auth.session.userId, orderId, poId))) {
    return apiError(403, "You don't have write access to the procurement stages on this order.");
  }

  const requirement = await prisma.materialRequirement.create({
    data: {
      orderId,
      poId,
      category: body.category,
      name: body.name,
      requiredQty: body.requiredQty,
      unit: body.unit,
      supplier: body.supplier ?? null,
      sortOrder: body.sortOrder ?? 0,
      isCompleted: !!body.isCompleted,
      notes: body.notes ?? null,
      createdBy: auth.session.userId,
      updatedBy: auth.session.userId,
    },
  });

  return NextResponse.json({ requirement: serializeForJson(requirement) }, { status: 201 });
}
