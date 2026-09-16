import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { serializeForJson } from "@/lib/server/serialize";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const poId = typeof body?.poId === "string" ? body.poId : null;
  const lotNo = typeof body?.lotNo === "string" ? body.lotNo.trim() : "";
  if (!orderId || !lotNo) return apiError(400, "orderId and lotNo are required.");

  const lot = await prisma.productionLot.create({
    data: {
      orderId,
      poId,
      lotNo,
      fabricType: typeof body?.fabricType === "string" ? body.fabricType : null,
      notes: typeof body?.notes === "string" ? body.notes : null,
      createdBy: auth.session.userId,
    },
  });

  return NextResponse.json({ lot: serializeForJson(lot) }, { status: 201 });
}
