import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterAnySection } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { lotCreate, parseBody } from "@/lib/server/validation";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(lotCreate, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const { orderId, poId, lotNo, fabricType, notes } = parsed.data;

  // A lot belongs to the order, not one stage: anyone who can enter production data on this order may open one.
  if (!(await canEnterAnySection(auth.session.userId, orderId, poId))) {
    return apiError(403, "You don't have write access to this order.");
  }

  const lot = await prisma.productionLot.create({
    data: { orderId, poId, lotNo, fabricType, notes, createdBy: auth.session.userId },
  });

  return NextResponse.json({ lot: serializeForJson(lot) }, { status: 201 });
}
