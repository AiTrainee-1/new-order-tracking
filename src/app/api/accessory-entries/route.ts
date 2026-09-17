import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterAccessories } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/**
 * POST only, by design - see accessory-requirements/route.ts. Every entry
 * (purchase/inward/dispatch) is a permanent movement once saved.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const requirementId = typeof body?.requirementId === "string" ? body.requirementId : "";
  if (!requirementId) return apiError(400, "requirementId is required.");

  const requirement = await prisma.accessoryRequirement.findUnique({ where: { id: requirementId } });
  if (!requirement) return apiError(404, "Requirement not found.");
  if (!(await canEnterAccessories(auth.session.userId, requirement.orderId, requirement.poId))) {
    return apiError(403, "You don't have write access to the accessories stage on this order.");
  }

  const entry = await prisma.accessoryEntry.create({
    data: {
      requirementId,
      entryType: body.entryType,
      qty: body.qty,
      entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
      vendor: body.vendor ?? null,
      docNo: body.docNo ?? null,
      sentTo: body.sentTo ?? null,
      notes: body.notes ?? null,
      enteredBy: auth.session.userId,
    },
  });

  return NextResponse.json({ entry: serializeForJson(entry) }, { status: 201 });
}
