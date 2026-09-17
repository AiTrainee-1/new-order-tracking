import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterAccessories } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/**
 * POST only, by design - once an accessory is required, it's a permanent
 * tracking record. There is no [id]/route.ts for this model, and never
 * should be: no PATCH/DELETE anywhere in this app touches accessory data.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const poId = typeof body?.poId === "string" ? body.poId : null;
  if (!orderId) return apiError(400, "orderId is required.");
  if (!(await canEnterAccessories(auth.session.userId, orderId, poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  const requirement = await prisma.accessoryRequirement.create({
    data: {
      orderId,
      poId,
      name: body.name,
      requiredQty: body.requiredQty,
      unit: body.unit,
      requiredDate: body.requiredDate ? new Date(body.requiredDate) : null,
      sortOrder: body.sortOrder ?? 0,
      notes: body.notes ?? null,
      createdBy: auth.session.userId,
    },
  });

  return NextResponse.json({ requirement: serializeForJson(requirement) }, { status: 201 });
}
